/**
 * Fills an account with realistic training history, so History, the trend
 * lines and the records feed can be looked at without lifting for two months.
 *
 * Runs as a **normal signed-in user** through the client SDK, not the Admin
 * SDK: every write goes through the same security rules the app does, so if
 * this script can write it, the app could have. No service-account key is
 * needed and none is stored.
 *
 *   npm run seed -- --email demo@example.com --password 'Hunter2$Hunter2'
 *
 * Flags:
 *   --email / --password   the account to seed. Created if it does not exist.
 *   --weeks N              how much history to generate (default 8).
 *   --reset                delete the account's existing data first.
 *   --backfill-only        only add `exerciseIds` to sessions missing it, and
 *                          seed nothing. See `backfill` below.
 *   --env FILE             which env file to read config from (default
 *                          .env.local, falling back to .env).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  getFirestore,
  terminate,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import type { ExerciseStats, WorkoutStats } from '@/domain/overlay';
import { buildStatsUpdate } from '@/domain/overlay';
import type { LoggedSet, Session, SessionEntry } from '@/domain/sessions';
import { localDateKey, sessionExerciseIds } from '@/domain/sessions';
import type { ExerciseSlot, Prescription, WorkoutBody } from '@/domain/workouts';
import { DEFAULT_PRESCRIPTION } from '@/domain/workouts';

// --- CLI ------------------------------------------------------------------

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? '';
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);

// --- Config ---------------------------------------------------------------

/**
 * The web config, read from the same env files Vite reads.
 *
 * Deliberately not duplicated into the script: pointing a seeder at a
 * different project than the app is exactly the mistake that ends with test
 * data in production.
 */
function readEnv(): Record<string, string> {
  const names = flag('env') === null ? ['.env.local', '.env'] : [flag('env') ?? ''];
  for (const name of names) {
    try {
      const raw = readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
      const values: Record<string, string> = {};
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const split = trimmed.indexOf('=');
        if (split === -1) continue;
        values[trimmed.slice(0, split).trim()] = trimmed.slice(split + 1).trim();
      }
      console.log(`Using ${name} → project ${values['VITE_FIREBASE_PROJECT_ID'] ?? '(unset)'}`);
      return values;
    } catch {
      continue;
    }
  }
  throw new Error('No env file found. Expected .env.local or .env in the repo root.');
}

function requireValue(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (value === undefined || value === '') throw new Error(`${key} is missing from the env file.`);
  return value;
}

// --- The programme --------------------------------------------------------

type ExercisePlan = {
  id: string;
  name: string;
  sets: number;
  reps: [number, number];
  rir: [number, number];
  rest: number;
  /** Starting load in lb; null for a bodyweight lift, logged as reps only. */
  start: number | null;
  /** Added per week, before noise. */
  step: number;
};

function slotOf(plan: ExercisePlan, index: number): ExerciseSlot {
  const prescription: Prescription = {
    ...DEFAULT_PRESCRIPTION,
    sets: plan.sets,
    repRange: { min: plan.reps[0], max: plan.reps[1] },
    rirRange: { min: plan.rir[0], max: plan.rir[1] },
    restSeconds: plan.rest,
    loadHint: null,
  };
  return {
    slotId: `${plan.id}-${String(index)}`,
    kind: 'exercise',
    exerciseId: plan.id,
    exerciseName: plan.name,
    occurrenceIndex: 0,
    prescription,
    supersetGroup: null,
    notes: '',
  };
}

const BENCH: ExercisePlan = {
  id: 'Barbell_Bench_Press_-_Medium_Grip',
  name: 'Barbell Bench Press - Medium Grip',
  sets: 4,
  reps: [6, 8],
  rir: [1, 3],
  rest: 180,
  start: 135,
  step: 5,
};

const INCLINE: ExercisePlan = {
  id: 'Incline_Dumbbell_Press',
  name: 'Incline Dumbbell Press',
  sets: 3,
  reps: [8, 12],
  rir: [1, 2],
  rest: 120,
  start: 50,
  step: 2.5,
};

const PUSHDOWN: ExercisePlan = {
  id: 'Triceps_Pushdown',
  name: 'Triceps Pushdown',
  sets: 3,
  reps: [10, 15],
  rir: [0, 2],
  rest: 90,
  start: 50,
  step: 2.5,
};

const LATERAL: ExercisePlan = {
  id: 'Side_Lateral_Raise',
  name: 'Side Lateral Raise',
  sets: 3,
  reps: [12, 20],
  rir: [0, 2],
  rest: 60,
  start: 15,
  step: 1,
};

const OVERHEAD: ExercisePlan = {
  id: 'Standing_Military_Press',
  name: 'Standing Military Press',
  sets: 3,
  reps: [6, 10],
  rir: [1, 3],
  rest: 150,
  start: 75,
  step: 2.5,
};

const DEADLIFT: ExercisePlan = {
  id: 'Barbell_Deadlift',
  name: 'Barbell Deadlift',
  sets: 3,
  reps: [4, 6],
  rir: [1, 3],
  rest: 240,
  start: 225,
  step: 10,
};

const PULLUP: ExercisePlan = {
  id: 'Pullups',
  name: 'Pullups',
  sets: 4,
  reps: [6, 10],
  rir: [0, 2],
  rest: 150,
  // Bodyweight: logged as reps with no load, which is the case that must not
  // vanish from set counts or the muscle map just because it cannot be scored.
  start: null,
  step: 0,
};

const ROW: ExercisePlan = {
  id: 'Bent_Over_Barbell_Row',
  name: 'Bent Over Barbell Row',
  sets: 3,
  reps: [8, 12],
  rir: [1, 2],
  rest: 120,
  start: 115,
  step: 5,
};

const CURL: ExercisePlan = {
  id: 'Barbell_Curl',
  name: 'Barbell Curl',
  sets: 3,
  reps: [10, 15],
  rir: [0, 2],
  rest: 90,
  start: 55,
  step: 2.5,
};

const FACE_PULL: ExercisePlan = {
  id: 'Face_Pull',
  name: 'Face Pull',
  sets: 3,
  reps: [15, 20],
  rir: [0, 2],
  rest: 60,
  start: 40,
  step: 2.5,
};

const SQUAT: ExercisePlan = {
  id: 'Barbell_Squat',
  name: 'Barbell Squat',
  sets: 4,
  reps: [5, 8],
  rir: [1, 3],
  rest: 210,
  start: 185,
  step: 10,
};

const RDL: ExercisePlan = {
  id: 'Romanian_Deadlift',
  name: 'Romanian Deadlift',
  sets: 3,
  reps: [8, 12],
  rir: [1, 2],
  rest: 150,
  start: 155,
  step: 5,
};

const LEG_PRESS: ExercisePlan = {
  id: 'Leg_Press',
  name: 'Leg Press',
  sets: 3,
  reps: [10, 15],
  rir: [1, 2],
  rest: 120,
  start: 270,
  step: 20,
};

const LEG_CURL: ExercisePlan = {
  id: 'Lying_Leg_Curls',
  name: 'Lying Leg Curls',
  sets: 3,
  reps: [12, 15],
  rir: [0, 2],
  rest: 90,
  start: 70,
  step: 2.5,
};

const PUSH_V1: ExercisePlan[] = [BENCH, INCLINE, PUSHDOWN, LATERAL];

/**
 * PUSH after the week-4 edit: an exercise added and bench taken to five sets.
 *
 * The point of seeding two versions is the archaeology view — a week-1 session
 * must still open showing four sets and no overhead press.
 */
const PUSH_V2: ExercisePlan[] = [{ ...BENCH, sets: 5 }, INCLINE, OVERHEAD, PUSHDOWN, LATERAL];

const PULL: ExercisePlan[] = [DEADLIFT, PULLUP, ROW, CURL, FACE_PULL];

const LEGS: ExercisePlan[] = [SQUAT, RDL, LEG_PRESS, LEG_CURL];

/**
 * A second day that also benches.
 *
 * Without it the workout filter on the exercise-history screen has nothing to
 * separate, and tier 2 of the overlay never fires. Bench here is lighter and
 * for more reps, exactly as it would be after a day of shoulder work — which
 * is the whole argument for keeping the two histories apart (§2.6).
 */
const CHEST: ExercisePlan[] = [
  { ...BENCH, sets: 3, reps: [8, 12], rir: [1, 2], start: 115, step: 2.5 },
  INCLINE,
  { ...LATERAL, sets: 4 },
  FACE_PULL,
];

type WorkoutSeed = {
  workoutId: string;
  name: string;
  /** One entry per published version, oldest first. */
  versions: { plans: ExercisePlan[]; changeSummary: string }[];
  /** Day of the week it is performed on: 1 = Monday. */
  weekday: number;
  /** Performed every Nth week, offset from week 0. */
  everyNWeeks?: number;
};

const PROGRAMME: WorkoutSeed[] = [
  {
    workoutId: 'seed-push',
    name: 'PUSH',
    weekday: 1,
    versions: [
      { plans: PUSH_V1, changeSummary: 'Created PUSH with 4 exercises' },
      {
        plans: PUSH_V2,
        changeSummary: 'Added Standing Military Press, Barbell Bench Press - Medium Grip 4→5 sets',
      },
    ],
  },
  {
    workoutId: 'seed-pull',
    name: 'PULL',
    weekday: 3,
    versions: [{ plans: PULL, changeSummary: 'Created PULL with 5 exercises' }],
  },
  {
    workoutId: 'seed-legs',
    name: 'LEGS',
    weekday: 5,
    versions: [{ plans: LEGS, changeSummary: 'Created LEGS with 4 exercises' }],
  },
  {
    workoutId: 'seed-chest',
    name: 'CHEST + DELTS',
    weekday: 6,
    everyNWeeks: 2,
    versions: [{ plans: CHEST, changeSummary: 'Created CHEST + DELTS with 4 exercises' }],
  },
];

// --- Generation -----------------------------------------------------------

/**
 * A small deterministic PRNG, so re-running the seeder produces the same
 * history rather than a subtly different one each time. Comparing two runs is
 * then a real comparison.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const random = makeRandom(20250909);

function pick(range: [number, number]): number {
  const [min, max] = range;
  return min + Math.floor(random() * (max - min + 1));
}

/** Rounds to the nearest 2.5 lb, the smallest plate pair on a real bar. */
function toPlate(value: number): number {
  return Math.round(value / 2.5) * 2.5;
}

function loadFor(plan: ExercisePlan, week: number): number | null {
  if (plan.start === null) return null;
  // A little noise, and one deliberate down week, so the trend line is a
  // training log rather than a straight line and the PR list has gaps.
  const slump = week === 4 ? -plan.step * 1.5 : 0;
  const noise = (random() - 0.45) * plan.step;
  return Math.max(plan.start, toPlate(plan.start + plan.step * week + slump + noise));
}

function setsFor(plan: ExercisePlan, week: number, startedAt: Date): LoggedSet[] {
  const load = loadFor(plan, week);

  return Array.from({ length: plan.sets }, (_unused, index) => {
    // Reps drift down across the sets of one exercise, as fatigue accumulates.
    const reps = Math.max(plan.reps[0] - 1, pick(plan.reps) - Math.floor(index / 2));
    const completedAt = new Date(startedAt.getTime() + (index + 1) * (plan.rest + 45) * 1000);

    return {
      setIndex: index,
      weight: load === null ? null : { value: load, unit: 'lb' as const },
      reps,
      rir: pick(plan.rir),
      isWarmup: false,
      skipped: false,
      completedAt: completedAt.toISOString(),
    };
  });
}

function entriesFor(plans: readonly ExercisePlan[], week: number, startedAt: Date): SessionEntry[] {
  let cursor = new Date(startedAt);

  return plans.map((plan, index) => {
    const sets = setsFor(plan, week, cursor);
    const last = sets[sets.length - 1];
    if (last?.completedAt != null) cursor = new Date(last.completedAt);

    const slot = slotOf(plan, index);
    return {
      slotId: slot.slotId,
      kind: 'exercise',
      exerciseId: plan.id,
      exerciseName: plan.name,
      occurrenceIndex: 0,
      prescription: slot.prescription,
      sets,
      supersetGroup: null,
      notes: '',
    };
  });
}

function bodyOf(seed: WorkoutSeed, versionIndex: number): WorkoutBody {
  const version = seed.versions[versionIndex];
  if (version === undefined) throw new Error(`No version ${String(versionIndex)} for ${seed.name}`);
  return { name: seed.name, slots: version.plans.map(slotOf), groupRest: {} };
}

/** Which published version was current in a given week. */
function versionIndexFor(seed: WorkoutSeed, week: number): number {
  // The second version lands at week 4, which is also the down week — so the
  // history shows an edit and a dip in the same place, as it usually does.
  return seed.versions.length > 1 && week >= 4 ? 1 : 0;
}

function buildSessions(uid: string, weeks: number): Session[] {
  const sessions: Session[] = [];

  // Anchor on the Monday of the current week and walk backwards, so the newest
  // session is always in "This week" whenever the script is run.
  const today = new Date();
  const thisMonday = new Date(today);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));

  for (let week = 0; week < weeks; week += 1) {
    const weeksAgo = weeks - 1 - week;

    for (const seed of PROGRAMME) {
      if (seed.everyNWeeks !== undefined && week % seed.everyNWeeks !== 0) continue;

      const day = new Date(thisMonday);
      day.setDate(day.getDate() - weeksAgo * 7 + (seed.weekday - 1));
      // Never seed a session in the future.
      if (day.getTime() > today.getTime()) continue;

      const startedAt = new Date(day);
      startedAt.setHours(18, pick([0, 40]), 0, 0);

      const versionIndex = versionIndexFor(seed, week);
      const version = seed.versions[versionIndex];
      if (version === undefined) continue;

      const entries = entriesFor(version.plans, week, startedAt);
      const lastSet = entries.at(-1)?.sets.at(-1);
      const completedAt =
        lastSet?.completedAt == null
          ? new Date(startedAt.getTime() + 55 * 60 * 1000)
          : new Date(lastSet.completedAt);

      sessions.push({
        id: `seed-${seed.workoutId}-${String(week)}`,
        workoutId: seed.workoutId,
        workoutVersion: versionIndex + 1,
        workoutName: seed.name,
        status: 'completed',
        performedOn: localDateKey(day),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        entries,
        groupRest: {},
        bodyweight: { value: toPlate(182 - week * 0.4), unit: 'lb' },
        notes: '',
      });
    }
  }

  console.log(`Generated ${String(sessions.length)} sessions for ${uid}.`);
  return sessions;
}

// --- Writing --------------------------------------------------------------

const BATCH_LIMIT = 400;

async function commitAll(
  db: Firestore,
  writes: { ref: DocumentReference; data: Record<string, unknown> }[],
): Promise<void> {
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const write of writes.slice(start, start + BATCH_LIMIT)) batch.set(write.ref, write.data);
    await batch.commit();
  }
}

async function deleteAll(db: Firestore, source: CollectionReference): Promise<number> {
  const snapshot = await getDocs(source);
  for (let start = 0; start < snapshot.docs.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const document of snapshot.docs.slice(start, start + BATCH_LIMIT)) {
      batch.delete(document.ref);
    }
    await batch.commit();
  }
  return snapshot.docs.length;
}

const userPath = (db: Firestore, uid: string, ...rest: string[]): CollectionReference =>
  collection(db, 'users', uid, ...rest);

async function reset(db: Firestore, uid: string): Promise<void> {
  for (const workout of (await getDocs(userPath(db, uid, 'workouts'))).docs) {
    await deleteAll(db, collection(workout.ref, 'versions'));
  }
  let removed = 0;
  for (const name of ['workouts', 'sessions', 'workoutStats', 'exerciseStats']) {
    removed += await deleteAll(db, userPath(db, uid, name));
  }
  console.log(`Reset: removed ${String(removed)} documents.`);
}

/**
 * Adds `exerciseIds` to sessions written before that field existed.
 *
 * Per-exercise history is an `array-contains` query on it, so without this a
 * session logged earlier is invisible to the trend line and the PR list — not
 * wrong, just absent, which is harder to notice and worse.
 */
async function backfill(db: Firestore, uid: string): Promise<void> {
  const snapshot = await getDocs(userPath(db, uid, 'sessions'));
  const writes: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

  for (const document of snapshot.docs) {
    const data = document.data();
    if (Array.isArray(data['exerciseIds'])) continue;
    const entries = Array.isArray(data['entries']) ? (data['entries'] as SessionEntry[]) : [];
    writes.push({ ref: document.ref, data: { exerciseIds: sessionExerciseIds(entries) } });
  }

  if (writes.length === 0) {
    console.log('Backfill: every session already has exerciseIds.');
    return;
  }
  // Merged, so nothing else on the session is touched.
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const write of writes.slice(start, start + BATCH_LIMIT)) {
      batch.set(write.ref, write.data, { merge: true });
    }
    await batch.commit();
  }
  console.log(`Backfill: added exerciseIds to ${String(writes.length)} sessions.`);
}

async function seed(db: Firestore, uid: string, weeks: number): Promise<void> {
  const now = Timestamp.now();
  const writes: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

  writes.push({
    ref: doc(db, 'users', uid),
    data: { displayUnit: 'lb', defaultRestSeconds: 120, createdAt: now },
  });

  for (const seedWorkout of PROGRAMME) {
    const latest = seedWorkout.versions.length - 1;
    const body = bodyOf(seedWorkout, latest);

    writes.push({
      ref: doc(db, 'users', uid, 'workouts', seedWorkout.workoutId),
      data: {
        ...body,
        notes: '',
        currentVersion: seedWorkout.versions.length,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    seedWorkout.versions.forEach((version, index) => {
      writes.push({
        ref: doc(
          db,
          'users',
          uid,
          'workouts',
          seedWorkout.workoutId,
          'versions',
          String(index + 1),
        ),
        data: {
          ...bodyOf(seedWorkout, index),
          versionNumber: index + 1,
          changeSummary: version.changeSummary,
          createdAt: now,
        },
      });
    });
  }

  const sessions = buildSessions(uid, weeks);

  for (const session of sessions) {
    writes.push({
      ref: doc(db, 'users', uid, 'sessions', session.id),
      data: {
        workoutId: session.workoutId,
        workoutVersion: session.workoutVersion,
        workoutName: session.workoutName,
        status: session.status,
        performedOn: session.performedOn,
        startedAt:
          session.startedAt === null ? null : Timestamp.fromDate(new Date(session.startedAt)),
        completedAt:
          session.completedAt === null ? null : Timestamp.fromDate(new Date(session.completedAt)),
        entries: session.entries,
        exerciseIds: sessionExerciseIds(session.entries),
        groupRest: session.groupRest,
        bodyweight: session.bodyweight,
        notes: session.notes,
        updatedAt: now,
      },
    });
  }

  // The overlay indexes, built by replaying the sessions in the order they
  // happened — the same pure function the app runs on completion, so the
  // records and the "last time" numbers agree with what the app would have
  // written had these been logged for real.
  const exerciseStats = new Map<string, ExerciseStats>();
  const workoutStats = new Map<string, WorkoutStats>();
  let records = 0;

  for (const session of [...sessions].sort((a, b) =>
    (a.completedAt ?? '').localeCompare(b.completedAt ?? ''),
  )) {
    const update = buildStatsUpdate(session, (id) => exerciseStats.get(id) ?? null);
    records += update.prs.length;
    for (const [id, stats] of update.exerciseStats) exerciseStats.set(id, stats);
    if (update.workoutStats !== null) {
      workoutStats.set(update.workoutStats.workoutId, update.workoutStats);
    }
  }

  for (const [id, stats] of workoutStats) {
    writes.push({
      ref: doc(db, 'users', uid, 'workoutStats', id),
      data: { ...stats, updatedAt: now },
    });
  }
  for (const [id, stats] of exerciseStats) {
    writes.push({
      ref: doc(db, 'users', uid, 'exerciseStats', id),
      data: { ...stats, updatedAt: now },
    });
  }

  await commitAll(db, writes);
  console.log(
    `Wrote ${String(writes.length)} documents: ${String(PROGRAMME.length)} workouts, ` +
      `${String(sessions.length)} sessions, ${String(exerciseStats.size)} exercise records ` +
      `(${String(records)} PRs set along the way).`,
  );
}

// --- Entry point ----------------------------------------------------------

async function signInOrCreate(
  auth: ReturnType<typeof getAuth>,
  email: string,
  password: string,
): Promise<User> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.log(`Signed in as existing user ${email}.`);
    return credential.user;
  } catch (cause) {
    const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') throw cause;
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  console.log(`Created new user ${email}.`);
  return credential.user;
}

async function main(): Promise<void> {
  const email = flag('email');
  const password = flag('password');
  if (email === null || email === '' || password === null || password === '') {
    throw new Error('Both --email and --password are required.');
  }

  const values = readEnv();
  const options: FirebaseOptions = {
    apiKey: requireValue(values, 'VITE_FIREBASE_API_KEY'),
    authDomain: requireValue(values, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: requireValue(values, 'VITE_FIREBASE_PROJECT_ID'),
    storageBucket: values['VITE_FIREBASE_STORAGE_BUCKET'] ?? '',
    messagingSenderId: values['VITE_FIREBASE_MESSAGING_SENDER_ID'] ?? '',
    appId: values['VITE_FIREBASE_APP_ID'] ?? '',
  };

  const app = initializeApp(options);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const user = await signInOrCreate(auth, email, password);

  if (has('backfill-only')) {
    await backfill(db, user.uid);
  } else {
    if (has('reset')) await reset(db, user.uid);
    const weeks = Number(flag('weeks') ?? '8');
    await seed(db, user.uid, Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : 8);
    await backfill(db, user.uid);
  }

  await terminate(db);
  console.log('Done.');
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
