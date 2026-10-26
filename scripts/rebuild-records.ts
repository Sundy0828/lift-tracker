/**
 * Rescores every account's stored records on the current scoring rule.
 *
 * A record (`exerciseStats/{exerciseId}`: `bestE1rm`, `bestSet` and when it
 * was set) is a running maximum written when a session is completed, so it
 * keeps whatever rule scored it at the time. When bodyweight lifts moved to
 * their own scale (`LoadScale` in `@lift/domain/strength`), a weighted dip
 * that the old rule scored below an unweighted one stayed beaten in the
 * stored record. This walks each account's completed sessions and rebuilds
 * every record from them with the same function the app runs when a session
 * is deleted (`rebuildExerciseStats`), scoring each exercise on its scale from
 * the catalog plus that account's custom exercises.
 *
 *   pnpm run rebuild-records                                # dry run, every account
 *   pnpm run rebuild-records --email you@example.com        # dry run, one account
 *   pnpm run rebuild-records --apply                        # writes
 *
 * **Dry run by default**, printing each record that would move, old and new,
 * so the list can be read before anything is written. Only those documents
 * are written; a record the new rule leaves where it was is not touched.
 *
 * Only `exerciseStats` holds a score. `workoutStats` holds last time's sets
 * and the calendar index holds tonnage, neither of which the scoring rule
 * affects, so unlike `negate-assisted` (which changed the sets themselves)
 * this rebuilds neither.
 *
 * Admin SDK, like prune-users: GOOGLE_APPLICATION_CREDENTIALS points at a
 * service-account key kept outside the repo, and the script refuses a key for
 * a different project from the one the app points at.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentReference,
} from 'firebase-admin/firestore';
import { parseCustomExercise } from '@lift/domain/exercises';
import type { ExerciseStats } from '@lift/domain/overlay';
import { parseExerciseStats } from '@lift/domain/overlay';
import { rebuildExerciseStats } from '@lift/domain/rebuild';
import { parseSession, sessionExerciseIds, type Session } from '@lift/domain/sessions';
import { loadScaleLookup } from '@lift/domain/strength';
import { formatNumber } from '@lift/domain/units';
import { exerciseResolver } from './exercise-library';

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? '';
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);

type KeyFile = ServiceAccount & { project_id?: string };

function loadCredentials(): KeyFile {
  const path = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  if (path === undefined || path === '') {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set. See scripts/prune-users.ts.');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as KeyFile;
}

/** The project the app points at, so this refuses to run against another. */
function appProjectId(): string | null {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
      const value = /^VITE_FIREBASE_PROJECT_ID=(.+)$/m.exec(raw)?.[1]?.trim();
      if (value !== undefined && value !== '') return value;
    } catch {
      continue;
    }
  }
  return null;
}

/** Admin Timestamps to ISO strings, as the app's converters hand them to the domain. */
function plain(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = value instanceof Timestamp ? value.toDate().toISOString() : value;
  }
  return out;
}

/** Ten grams, as `beatsRecord` reads it: below that two records are the same. */
const EPSILON = 0.01;

/** Whether the rebuilt record differs from the stored one in anything a score decides. */
function recordMoved(before: ExerciseStats | null, after: ExerciseStats | null): boolean {
  if (before === null || after === null) return before !== after;
  return (
    Math.abs(before.bestE1rm - after.bestE1rm) > EPSILON ||
    before.bestE1rmSessionId !== after.bestE1rmSessionId ||
    before.bestSet?.setIndex !== after.bestSet?.setIndex
  );
}

function kg(stats: ExerciseStats | null): string {
  return stats?.bestSet == null ? '—' : `${formatNumber(stats.bestE1rm)} kg`;
}

type Change = {
  exerciseId: string;
  name: string;
  before: ExerciseStats | null;
  after: ExerciseStats | null;
};

/** One account: what would move, written only with `apply`. */
async function rebuildAccount(userRef: DocumentReference, apply: boolean): Promise<Change[]> {
  const [sessionDocs, statDocs, customDocs] = await Promise.all([
    userRef.collection('sessions').get(),
    userRef.collection('exerciseStats').get(),
    userRef.collection('customExercises').get(),
  ]);

  const sessions: Session[] = sessionDocs.docs.map((doc) =>
    parseSession(doc.id, plain(doc.data())),
  );
  const resolver = exerciseResolver(
    customDocs.docs.map((doc) => parseCustomExercise(doc.id, plain(doc.data()))),
  );
  const scaleOf = loadScaleLookup(resolver);

  const stored = new Map<string, ExerciseStats>();
  for (const doc of statDocs.docs)
    stored.set(doc.id, parseExerciseStats(doc.id, plain(doc.data())));

  // Every exercise with a record or a session: a record whose sessions are all
  // gone is deleted, as `deleteSession` would have done.
  const exerciseIds = new Set<string>(stored.keys());
  for (const session of sessions) {
    for (const id of sessionExerciseIds(session.entries)) exerciseIds.add(id);
  }

  const changes: Change[] = [];
  for (const exerciseId of [...exerciseIds].sort()) {
    const before = stored.get(exerciseId) ?? null;
    const after = rebuildExerciseStats(exerciseId, sessions, scaleOf(exerciseId));
    if (!recordMoved(before, after)) continue;
    changes.push({
      exerciseId,
      name: resolver.resolve(exerciseId)?.name ?? exerciseId,
      before,
      after,
    });
  }

  if (apply) {
    for (const { exerciseId, after } of changes) {
      const ref = userRef.collection('exerciseStats').doc(exerciseId);
      if (after === null) await ref.delete();
      else await ref.set({ ...after, updatedAt: FieldValue.serverTimestamp() });
    }
  }
  return changes;
}

async function main(): Promise<void> {
  const email = flag('email');
  if (email !== null && !email.includes('@')) throw new Error('--email needs an address.');
  const apply = has('apply');

  const credentials = loadCredentials();
  const actual = credentials.projectId ?? credentials.project_id ?? null;
  const expected = appProjectId();
  if (actual === null) throw new Error('That key file has no project id in it.');
  if (expected !== null && actual !== expected) {
    throw new Error(`The key is for "${actual}" but the app points at "${expected}". Refusing.`);
  }

  const app = initializeApp({ credential: cert(credentials) });
  const db = getFirestore(app);

  // Every account with data lives under `users/{uid}`; listDocuments also
  // finds one whose own document was never written.
  const users =
    email === null
      ? await db.collection('users').listDocuments()
      : [db.collection('users').doc((await getAuth(app).getUserByEmail(email)).uid)];
  console.log(
    `Project ${actual}, ${String(users.length)} account${users.length === 1 ? '' : 's'}.\n`,
  );

  let moved = 0;
  let accounts = 0;
  for (const userRef of users) {
    const changes = await rebuildAccount(userRef, apply);
    if (changes.length === 0) continue;
    accounts += 1;
    moved += changes.length;

    console.log(userRef.id);
    for (const { name, before, after } of changes) {
      const at = after?.bestE1rmAt ?? null;
      const where = at === null ? '' : `  (${at})`;
      console.log(`  ${name}: ${kg(before)} → ${kg(after)}${where}`);
    }
  }

  if (moved === 0) {
    console.log('Every stored record already matches the current scoring. Nothing to do.');
    return;
  }
  console.log(
    `\n${apply ? 'REBUILT' : 'WOULD REBUILD'} ${String(moved)} records in ${String(accounts)} accounts.`,
  );
  if (!apply) console.log('Dry run. Check the list, then re-run with --apply.');
}

main().then(
  () => {
    process.exit(0);
  },
  (cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exit(1);
  },
);
