/**
 * Turns one account's assisted dips and pull-ups into negative loads.
 *
 * Before loads could be negative, an assisted set was logged as the
 * assistance itself: 40 lb on the assisted pull-up machine was stored as +40,
 * which reads as 40 lb *added* and scores the hardest sets (the least help)
 * as the weakest. This flips every positive load on a matching exercise to
 * negative, then rebuilds that account's records and overlay stats from the
 * corrected sessions, and has the app rebuild its calendar index.
 *
 *   pnpm run negate-assisted --email you@example.com            # dry run
 *   pnpm run negate-assisted --email you@example.com --apply    # writes
 *   pnpm run negate-assisted --email you@example.com --match "dip|pull"
 *
 * **Dry run by default**, listing every set it would change, so the list can
 * be checked before anything is written: a genuinely weighted dip (+25 lb on
 * a belt) would be flipped too, and should be excluded with --match first.
 *
 * Admin SDK, like prune-users: see that script for the service-account key
 * (GOOGLE_APPLICATION_CREDENTIALS) and keep the key out of the repo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rebuildExerciseStats, rebuildWorkoutStats } from '@lift/domain/rebuild';
import { parseCustomExercise } from '@lift/domain/exercises';
import { parseSession, type Session } from '@lift/domain/sessions';
import { loadScaleLookup } from '@lift/domain/strength';
import { exerciseResolver } from './exercise-library';

/** Dips, pull-ups and chin-ups, by name: the lifts an assisted machine is for. */
const DEFAULT_MATCH = String.raw`\b(dips?|pull[\s-]?ups?|chin[\s-]?ups?)\b`;

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
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at a service-account JSON key ' +
        '(Firebase console → Project settings → Service accounts → Generate new private key).',
    );
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

type Change = {
  sessionId: string;
  performedOn: string;
  exerciseName: string;
  set: number;
  before: string;
  after: string;
};

type RawSet = { weight?: { value?: unknown; unit?: unknown } | null } & Record<string, unknown>;
type RawEntry = {
  kind?: unknown;
  exerciseId?: unknown;
  exerciseName?: unknown;
  sets?: unknown;
} & Record<string, unknown>;

async function main(): Promise<void> {
  const email = flag('email');
  if (!email?.includes('@')) throw new Error('Pass --email with the account.');
  const match = new RegExp(flag('match') ?? DEFAULT_MATCH, 'iu');
  const apply = has('apply');

  const credentials = loadCredentials();
  const app = initializeApp({ credential: cert(credentials) });
  const actual = credentials.projectId ?? credentials.project_id ?? null;
  const expected = appProjectId();
  if (actual === null) throw new Error('That key file has no project id in it.');
  if (expected !== null && actual !== expected) {
    throw new Error(`The key is for "${actual}" but the app points at "${expected}". Refusing.`);
  }

  const user = await getAuth(app).getUserByEmail(email);
  const db = getFirestore(app);
  const userRef = db.collection('users').doc(user.uid);
  const snapshot = await userRef.collection('sessions').get();
  console.log(`Project ${actual}, ${email} (${user.uid}), ${String(snapshot.size)} sessions.`);
  console.log(`Matching exercise names against /${match.source}/i\n`);

  const changes: Change[] = [];
  const names = new Set<string>();
  const touchedExercises = new Set<string>();
  const touchedWorkouts = new Set<string>();
  const updates: { id: string; entries: RawEntry[] }[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const entries = Array.isArray(data['entries']) ? (data['entries'] as RawEntry[]) : [];
    // Counted in a callback, so an object: a plain boolean would read as never set.
    const flipped = { count: 0 };

    const next = entries.map((entry) => {
      const name = typeof entry.exerciseName === 'string' ? entry.exerciseName : '';
      if (entry.kind === 'rest' || !match.test(name) || !Array.isArray(entry.sets)) return entry;
      names.add(name);

      const sets = (entry.sets as RawSet[]).map((set, index) => {
        const value = set.weight?.value;
        if (typeof value !== 'number' || value <= 0) return set;
        flipped.count += 1;
        if (typeof entry.exerciseId === 'string') touchedExercises.add(entry.exerciseId);
        const unit = typeof set.weight?.unit === 'string' ? set.weight.unit : '';
        changes.push({
          sessionId: doc.id,
          performedOn: typeof data['performedOn'] === 'string' ? data['performedOn'] : '?',
          exerciseName: name,
          set: index + 1,
          before: `${String(value)} ${unit}`,
          after: `${String(-value)} ${unit}`,
        });
        return { ...set, weight: { ...set.weight, value: -value } };
      });
      return { ...entry, sets };
    });

    if (flipped.count > 0) {
      updates.push({ id: doc.id, entries: next });
      if (typeof data['workoutId'] === 'string') touchedWorkouts.add(data['workoutId']);
    }
  }

  console.log(`Exercises matched: ${[...names].sort().join(', ') || 'none'}\n`);
  if (changes.length === 0) {
    console.log('No positive loads on those exercises. Nothing to do.');
    return;
  }
  changes.sort((a, b) => a.performedOn.localeCompare(b.performedOn));
  for (const change of changes) {
    console.log(
      `  ${change.performedOn}  ${change.exerciseName}  set ${String(change.set)}  ${change.before} → ${change.after}`,
    );
  }
  console.log(
    `\n${apply ? 'CHANGING' : 'WOULD CHANGE'} ${String(changes.length)} sets in ${String(updates.length)} sessions.`,
  );

  if (!apply) {
    console.log('Dry run. Check the list, then re-run with --apply.');
    return;
  }

  for (const update of updates) {
    await userRef.collection('sessions').doc(update.id).update({ entries: update.entries });
  }

  // Records and the overlay are running aggregates, so they are rebuilt from
  // the corrected sessions rather than patched.
  const corrected = await userRef.collection('sessions').get();
  const sessions: Session[] = corrected.docs.map((doc) => parseSession(doc.id, plain(doc.data())));
  // Scored per exercise, as the app scores them (see `LoadScale`).
  const custom = await userRef.collection('customExercises').get();
  const scaleOf = loadScaleLookup(
    exerciseResolver(custom.docs.map((doc) => parseCustomExercise(doc.id, plain(doc.data())))),
  );

  for (const exerciseId of touchedExercises) {
    const stats = rebuildExerciseStats(exerciseId, sessions, scaleOf(exerciseId));
    const ref = userRef.collection('exerciseStats').doc(exerciseId);
    if (stats === null) await ref.delete();
    else await ref.set({ ...stats, updatedAt: FieldValue.serverTimestamp() });
  }
  for (const workoutId of touchedWorkouts) {
    const stats = rebuildWorkoutStats(workoutId, sessions);
    const ref = userRef.collection('workoutStats').doc(workoutId);
    if (stats === null) await ref.delete();
    else await ref.set({ ...stats, updatedAt: FieldValue.serverTimestamp() });
  }

  // The calendar's day index holds each day's tonnage, which assisted sets no
  // longer add to. Version 0 has the app rebuild it the next time it opens.
  await userRef.set({ dayIndexVersion: 0 }, { merge: true });

  console.log(
    `Done. Rebuilt ${String(touchedExercises.size)} exercise records and ${String(touchedWorkouts.size)} workout overlays; the calendar rebuilds itself next time it is opened.`,
  );
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
