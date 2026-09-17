/**
 * Fills the global workout library.
 *
 *   npm run seed:library              # dry run: prints what it would write
 *   npm run seed:library -- --write   # actually does it
 *   npm run seed:library -- --prune --write
 *
 * **Dry run by default**, so the safe thing is also the thing you get by
 * typing less. `--prune` also deletes library documents the seed no longer
 * names, which is how an entry is retired.
 *
 * Needs the **Admin SDK**. `firestore.rules` makes `library` world-readable
 * and refuses every client write, so there is deliberately no signed-in path
 * that can do this:
 *
 *   Firebase console → Project settings → Service accounts → Generate key
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/outside/this/repo/key.json
 *
 * Keep that file out of the repo. It is a permanent, unscoped key to the whole
 * project.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { parseLibraryWorkout } from '@/domain/library';
import { SEED_LIBRARY, seedGroupRest, seedSlots, type SeedWorkout } from './library-seed';

const has = (name: string): boolean => process.argv.includes(`--${name}`);

const LIBRARY = 'library';

/**
 * A key as the console emits it, which is snake_case, alongside the camelCase
 * `ServiceAccount` the SDK's types describe. `cert()` takes either; this file
 * reads the project id itself, so it accepts both spellings too.
 */
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

function projectOf(key: KeyFile): string | null {
  return key.projectId ?? key.project_id ?? null;
}

/** The project the app itself points at, so this can refuse to stray. */
function appProjectId(): string | null {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
      const match = /^VITE_FIREBASE_PROJECT_ID=(.+)$/m.exec(raw);
      const value = match?.[1]?.trim();
      if (value !== undefined && value !== '') return value;
    } catch {
      continue;
    }
  }
  return null;
}

/** One seed entry as the document the app reads back. */
function documentFor(workout: SeedWorkout): Record<string, unknown> {
  return {
    name: workout.name,
    summary: workout.summary,
    level: workout.level,
    daysPerWeek: workout.daysPerWeek,
    tags: workout.tags,
    equipment: workout.equipment,
    slots: seedSlots(workout).map((slot) => ({ ...slot })),
    groupRest: seedGroupRest(workout),
  };
}

/**
 * Refuses to write anything the app would then refuse to read.
 *
 * The parser is the same one the client uses, so a seed with a typo in an
 * exercise id or an empty slot list fails here rather than shipping a row that
 * silently never appears.
 */
function verify(): Map<string, Record<string, unknown>> {
  const documents = new Map<string, Record<string, unknown>>();

  for (const workout of SEED_LIBRARY) {
    if (documents.has(workout.id)) {
      throw new Error(`Two seed workouts share the id "${workout.id}".`);
    }
    const data = documentFor(workout);
    if (parseLibraryWorkout(workout.id, data) === null) {
      throw new Error(`"${workout.id}" does not parse as a library workout.`);
    }
    documents.set(workout.id, data);
  }

  return documents;
}

async function main(): Promise<void> {
  const documents = verify();
  const write = has('write');
  const prune = has('prune');

  const credentials = loadCredentials();
  const expected = appProjectId();
  const actual = projectOf(credentials);
  if (actual === null) {
    throw new Error('That key file has no project id in it. Is it a service-account key?');
  }
  if (expected !== null && actual !== expected) {
    throw new Error(
      `The key is for "${actual}" but the app points at "${expected}". Refusing to run.`,
    );
  }

  const app = initializeApp({ credential: cert(credentials) });
  const db: Firestore = getFirestore(app);
  const library = db.collection(LIBRARY);

  const existing = new Set((await library.listDocuments()).map((document) => document.id));
  const stale = [...existing].filter((id) => !documents.has(id));

  console.log(`Project ${actual}`);
  console.log(
    `${String(documents.size)} workouts in the seed, ${String(existing.size)} in Firestore`,
  );
  for (const [id, data] of documents) {
    const slots = (data['slots'] as readonly unknown[]).length;
    console.log(`  ${existing.has(id) ? 'update' : 'create'}  ${id}  (${String(slots)} rows)`);
  }
  for (const id of stale) console.log(`  ${prune ? 'delete' : 'leave '}  ${id}  (not in the seed)`);

  if (!write) {
    console.log('\nDry run. Pass --write to apply it.');
    return;
  }

  // One batch: the library is small enough to fit well inside the 500-write
  // cap, and a half-written library is a browse list with holes in it.
  const batch = db.batch();
  for (const [id, data] of documents) batch.set(library.doc(id), data);
  if (prune) {
    for (const id of stale) batch.delete(library.doc(id));
  }
  await batch.commit();

  console.log('\nDone.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
