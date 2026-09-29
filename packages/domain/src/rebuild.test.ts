import { describe, expect, it } from 'vitest';
import type { ExerciseStats, WorkoutStats } from './overlay';
import { buildStatsUpdate } from './overlay';
import { rebuildExerciseStats, rebuildWorkoutStats } from './rebuild';
import type { LoggedSet, Session } from './sessions';
import { emptySet, newSession } from './sessions';
import { adjustedE1rm } from './strength';
import type { Unit } from './types';
import type { ExerciseSlot, WorkoutBody } from './workouts';
import { DEFAULT_PRESCRIPTION, occurrenceKey } from './workouts';

function set(
  setIndex: number,
  weight: number | null,
  reps: number | null,
  rir: number | null,
  overrides: Partial<LoggedSet> & { unit?: Unit } = {},
): LoggedSet {
  const { unit = 'lb', ...rest } = overrides;
  return {
    ...emptySet(setIndex),
    weight: weight === null ? null : { value: weight, unit },
    reps,
    rir,
    completedAt: '2025-08-26T18:00:00.000Z',
    ...rest,
  };
}

function slot(
  slotId: string,
  exerciseId: string,
  overrides: Partial<ExerciseSlot> = {},
): ExerciseSlot {
  return {
    slotId,
    kind: 'exercise',
    exerciseId,
    exerciseName: exerciseId,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION, sets: 3 },
    supersetGroup: null,
    notes: '',
    ...overrides,
  };
}

function body(name: string, slots: ExerciseSlot[]): WorkoutBody {
  return { name, slots, groupRest: {} };
}

type LoggedInput = {
  id: string;
  workoutId: string | null;
  workoutName: string;
  performedOn: string;
  startedAt?: string;
};

/** A completed session, as history holds it. */
function logged(
  input: LoggedInput,
  sets: Record<string, LoggedSet[]>,
  slots: ExerciseSlot[],
): Session {
  const session = newSession({
    sessionId: input.id,
    workoutId: input.workoutId,
    workoutVersion: 1,
    workoutName: input.workoutName,
    body: body(input.workoutName, slots),
    performedOn: input.performedOn,
    startedAt: input.startedAt ?? `${input.performedOn}T17:00:00.000Z`,
  });

  return {
    ...session,
    status: 'completed',
    entries: session.entries.map((entry) =>
      entry.slotId !== null && sets[entry.slotId] !== undefined
        ? { ...entry, sets: sets[entry.slotId] ?? [] }
        : entry,
    ),
  };
}

/** What completing these sessions in order would have left for one exercise. */
function foldExerciseStats(exerciseId: string, sessions: readonly Session[]): ExerciseStats | null {
  let stats: ExerciseStats | null = null;
  for (const session of sessions) {
    const update = buildStatsUpdate(session, (id) => (id === exerciseId ? stats : null));
    stats = update.exerciseStats.get(exerciseId) ?? stats;
  }
  return stats;
}

/** What completing these sessions in order would have left for one workout. */
function foldWorkoutStats(workoutId: string, sessions: readonly Session[]): WorkoutStats | null {
  let stats: WorkoutStats | null = null;
  for (const session of sessions) {
    const next = buildStatsUpdate(session, () => null).workoutStats;
    if (next !== null && next.workoutId === workoutId) stats = next;
  }
  return stats;
}

const BENCH_SLOT = slot('slot-bench', 'bench');

const light = set(0, 200, 5, 0);
const record = set(0, 225, 5, 0);
const middle = set(0, 205, 5, 0);

const first = logged(
  { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
  { 'slot-bench': [light] },
  [BENCH_SLOT],
);
const prSession = logged(
  { id: 's2', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-31' },
  { 'slot-bench': [record] },
  [BENCH_SLOT],
);
const latest = logged(
  { id: 's3', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-09-07' },
  { 'slot-bench': [middle] },
  [BENCH_SLOT],
);

describe('rebuildExerciseStats', () => {
  it('drops the record to the next best when the PR session is gone', () => {
    const all = rebuildExerciseStats('bench', [first, prSession, latest]);
    expect(all?.bestE1rmSessionId).toBe('s2');

    const stats = rebuildExerciseStats('bench', [first, latest]);
    expect(stats).not.toBeNull();
    expect(stats?.bestE1rm).toBeCloseTo(adjustedE1rm(middle) ?? 0, 6);
    expect(stats?.bestE1rmSessionId).toBe('s3');
    expect(stats?.bestE1rmAt).toBe('2025-09-07');
    expect(stats?.bestSet).toEqual(middle);
    expect(stats?.totalSessions).toBe(2);
  });

  it('reads the last performance off the newest remaining session', () => {
    const stats = rebuildExerciseStats('bench', [first, prSession]);
    expect(stats?.lastSessionId).toBe('s2');
    expect(stats?.lastPerformedOn).toBe('2025-08-31');
    expect(stats?.lastWorkoutId).toBe('push');
    expect(stats?.lastWorkoutName).toBe('PUSH');
    expect(stats?.lastSets).toEqual([record]);
  });

  it('is null when nothing is left, so the caller deletes the document', () => {
    expect(rebuildExerciseStats('bench', [])).toBeNull();
    expect(rebuildExerciseStats('squat', [first, prSession, latest])).toBeNull();
  });

  it('ignores an abandoned session', () => {
    const abandoned = { ...prSession, status: 'abandoned' as const };
    const stats = rebuildExerciseStats('bench', [first, abandoned]);
    expect(stats?.lastSessionId).toBe('s1');
    expect(stats?.totalSessions).toBe(1);
  });

  it('counts one session when the exercise was performed twice in it', () => {
    const twice = logged(
      { id: 's9', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-09-14' },
      { 'slot-bench': [light], 'slot-bench-2': [record] },
      [BENCH_SLOT, slot('slot-bench-2', 'bench', { occurrenceIndex: 1 })],
    );

    const stats = rebuildExerciseStats('bench', [first, twice]);
    expect(stats?.totalSessions).toBe(2);
    // Both occurrences feed the record, and the later row is the last one.
    expect(stats?.bestE1rmSessionId).toBe('s9');
    expect(stats?.lastSets).toEqual([record]);
  });

  it('ignores an entry whose only sets are warmups', () => {
    const warmupOnly = logged(
      { id: 's4', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-09-21' },
      { 'slot-bench': [set(0, 300, 5, 0, { isWarmup: true })] },
      [BENCH_SLOT],
    );

    expect(rebuildExerciseStats('bench', [warmupOnly])).toBeNull();

    const stats = rebuildExerciseStats('bench', [first, warmupOnly]);
    expect(stats?.lastSessionId).toBe('s1');
    expect(stats?.bestE1rm).toBeCloseTo(adjustedE1rm(light) ?? 0, 6);
  });

  it('breaks a shared performedOn on startedAt', () => {
    const morning = logged(
      {
        id: 'am',
        workoutId: 'push',
        workoutName: 'PUSH',
        performedOn: '2025-09-28',
        startedAt: '2025-09-28T08:00:00.000Z',
      },
      { 'slot-bench': [light] },
      [BENCH_SLOT],
    );
    const evening = logged(
      {
        id: 'pm',
        workoutId: 'push',
        workoutName: 'PUSH',
        performedOn: '2025-09-28',
        startedAt: '2025-09-28T19:00:00.000Z',
      },
      { 'slot-bench': [middle] },
      [BENCH_SLOT],
    );

    expect(rebuildExerciseStats('bench', [morning, evening])?.lastSessionId).toBe('pm');
    expect(rebuildExerciseStats('bench', [evening, morning])?.lastSessionId).toBe('pm');
  });

  it('equals the fold of buildStatsUpdate over the same sessions', () => {
    const chronological = [first, prSession, latest];
    // Scrambled, because a query returns whatever order it returns.
    const scrambled = [latest, first, prSession];

    expect(rebuildExerciseStats('bench', scrambled)).toEqual(
      foldExerciseStats('bench', chronological),
    );
  });

  it('equals the fold once the record session is left out', () => {
    expect(rebuildExerciseStats('bench', [latest, first])).toEqual(
      foldExerciseStats('bench', [first, latest]),
    );
  });

  it('equals the fold with two occurrences and a warmup-only session', () => {
    const twice = logged(
      { id: 's9', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-09-14' },
      { 'slot-bench': [record], 'slot-bench-2': [light] },
      [BENCH_SLOT, slot('slot-bench-2', 'bench', { occurrenceIndex: 1 })],
    );
    const warmupOnly = logged(
      { id: 's10', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-09-21' },
      { 'slot-bench': [set(0, 300, 5, 0, { isWarmup: true })] },
      [BENCH_SLOT],
    );
    const chronological = [first, twice, warmupOnly];

    expect(rebuildExerciseStats('bench', [warmupOnly, first, twice])).toEqual(
      foldExerciseStats('bench', chronological),
    );
  });
});

describe('rebuildWorkoutStats', () => {
  it('holds the newest remaining session of that workout', () => {
    const stats = rebuildWorkoutStats('push', [first, latest]);
    expect(stats?.lastSessionId).toBe('s3');
    expect(stats?.lastPerformedOn).toBe('2025-09-07');
    expect(stats?.byOccurrence[occurrenceKey('bench', 0)]?.sets).toEqual([middle]);
  });

  it('is null when the workout has no session left', () => {
    expect(rebuildWorkoutStats('push', [])).toBeNull();
    expect(rebuildWorkoutStats('pull', [first, latest])).toBeNull();
  });

  it('drops an entry with no performed sets and strips warmups', () => {
    const mixed = logged(
      { id: 's5', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-09-07' },
      {
        'slot-bench': [set(0, 135, 8, 0, { isWarmup: true }), middle],
        'slot-row': [set(0, null, null, null)],
      },
      [BENCH_SLOT, slot('slot-row', 'row')],
    );

    const stats = rebuildWorkoutStats('push', [mixed]);
    expect(Object.keys(stats?.byOccurrence ?? {})).toEqual([occurrenceKey('bench', 0)]);
    expect(stats?.byOccurrence[occurrenceKey('bench', 0)]?.sets).toEqual([middle]);
  });

  it('equals the fold of buildStatsUpdate over the same sessions', () => {
    expect(rebuildWorkoutStats('push', [latest, first, prSession])).toEqual(
      foldWorkoutStats('push', [first, prSession, latest]),
    );
  });
});
