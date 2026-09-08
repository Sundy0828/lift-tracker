import { describe, expect, it } from 'vitest';
import type { ExerciseStats, WorkoutStats } from './overlay';
import {
  buildStatsUpdate,
  isComparable,
  parseExerciseStats,
  parseWorkoutStats,
  previousSetAt,
  resolveOverlay,
  workedPosition,
} from './overlay';
import type { LoggedSet, Session, SessionEntry } from './sessions';
import { emptySet, newSession } from './sessions';
import { adjustedE1rm, describeComparison } from './strength';
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

/** A session whose sets are already filled in, as if it had just been logged. */
function logged(
  input: { id: string; workoutId: string | null; workoutName: string; performedOn: string },
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
    startedAt: `${input.performedOn}T17:00:00.000Z`,
  });

  return {
    ...session,
    entries: session.entries.map((entry) =>
      entry.slotId !== null && sets[entry.slotId] !== undefined
        ? { ...entry, sets: sets[entry.slotId] ?? [] }
        : entry,
    ),
  };
}

const NO_PREVIOUS = (): ExerciseStats | null => null;

describe('resolveOverlay', () => {
  const push = logged(
    { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
    { 'slot-bench': [set(0, 205, 6, 1), set(1, 205, 5, 0)] },
    [slot('slot-bench', 'bench')],
  );
  const pushStats = buildStatsUpdate(push, NO_PREVIOUS);
  const benchAnywhere = pushStats.exerciseStats.get('bench') ?? null;

  const chest = logged(
    { id: 's2', workoutId: 'chest', workoutName: 'CHEST + DELTS', performedOn: '2025-08-26' },
    { 'slot-bench': [set(0, 185, 9, 2)] },
    [slot('slot-bench', 'bench')],
  );
  const chestStats = buildStatsUpdate(chest, NO_PREVIOUS);

  it('prefers this workout own history, even when the exercise was done more recently elsewhere', () => {
    const overlay = resolveOverlay(
      { exerciseId: 'bench', occurrenceIndex: 0 },
      chestStats.workoutStats,
      benchAnywhere,
    );

    expect(overlay.kind).toBe('same-workout');
    if (overlay.kind !== 'same-workout') return;
    expect(overlay.data.workoutName).toBe('CHEST + DELTS');
    expect(overlay.data.performedOn).toBe('2025-08-26');
  });

  /**
   * The case the two tiers exist for: bench added to CHEST day when the only
   * bench history is from PUSH.
   */
  it('falls back to anywhere, labelled with where it came from', () => {
    const overlay = resolveOverlay(
      { exerciseId: 'bench', occurrenceIndex: 0 },
      null,
      benchAnywhere,
    );

    expect(overlay.kind).toBe('other-workout');
    if (overlay.kind !== 'other-workout') return;
    expect(overlay.data.workoutName).toBe('PUSH');
    expect(overlay.data.workoutId).toBe('push');
  });

  it('reports NEW when neither tier has anything', () => {
    expect(
      resolveOverlay({ exerciseId: 'fly', occurrenceIndex: 0 }, chestStats.workoutStats, null),
    ).toEqual({
      kind: 'new',
    });
  });

  it('only tier 1 is comparable, so tier 2 gets no delta', () => {
    expect(
      isComparable(
        resolveOverlay({ exerciseId: 'bench', occurrenceIndex: 0 }, chestStats.workoutStats, null),
      ),
    ).toBe(true);
    expect(
      isComparable(
        resolveOverlay({ exerciseId: 'bench', occurrenceIndex: 0 }, null, benchAnywhere),
      ),
    ).toBe(false);
    expect(isComparable({ kind: 'new' })).toBe(false);
  });

  it('falls through to tier 2 when tier 1 has the workout but not the exercise', () => {
    const overlay = resolveOverlay(
      { exerciseId: 'bench', occurrenceIndex: 1 },
      chestStats.workoutStats,
      benchAnywhere,
    );
    expect(overlay.kind).toBe('other-workout');
  });

  it('treats a tier-1 entry of only warmups as no history', () => {
    const warmupsOnly: WorkoutStats = {
      workoutId: 'push',
      workoutName: 'PUSH',
      lastSessionId: 's9',
      lastPerformedOn: '2025-09-01',
      byOccurrence: {
        [occurrenceKey('bench', 0)]: {
          sessionId: 's9',
          performedOn: '2025-09-01',
          workoutId: 'push',
          workoutName: 'PUSH',
          prescription: null,
          sets: [set(0, 135, 10, 5, { isWarmup: true })],
        },
      },
    };
    expect(resolveOverlay({ exerciseId: 'bench', occurrenceIndex: 0 }, warmupsOnly, null)).toEqual({
      kind: 'new',
    });
  });

  /** An `ExerciseSlot` has to satisfy the target shape without adaptation. */
  it('accepts a workout slot directly', () => {
    const overlay = resolveOverlay(slot('slot-bench', 'bench'), chestStats.workoutStats, null);
    expect(overlay.kind).toBe('same-workout');
  });
});

describe('duplicate occurrences', () => {
  const slots = [
    slot('slot-a', 'bench', { occurrenceIndex: 0 }),
    slot('slot-b', 'bench', { occurrenceIndex: 1 }),
  ];
  const session = logged(
    { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
    {
      'slot-a': [set(0, 225, 5, 1)],
      // The back-off set: same exercise, deliberately lighter.
      'slot-b': [set(0, 155, 12, 2)],
    },
    slots,
  );
  const update = buildStatsUpdate(session, NO_PREVIOUS);

  it('keys the two occurrences apart so they never collapse', () => {
    const byOccurrence = update.workoutStats?.byOccurrence ?? {};
    expect(Object.keys(byOccurrence).sort()).toEqual(['bench#0', 'bench#1']);
    expect(byOccurrence['bench#0']?.sets[0]?.weight?.value).toBe(225);
    expect(byOccurrence['bench#1']?.sets[0]?.weight?.value).toBe(155);
  });

  it('overlays each occurrence with its own history', () => {
    const first = resolveOverlay(slots[0] ?? slot('x', 'bench'), update.workoutStats, null);
    const second = resolveOverlay(slots[1] ?? slot('x', 'bench'), update.workoutStats, null);

    expect(first.kind === 'same-workout' && first.data.sets[0]?.weight?.value).toBe(225);
    expect(second.kind === 'same-workout' && second.data.sets[0]?.weight?.value).toBe(155);
  });

  it('keeps one tier-2 document for the exercise, holding the better set', () => {
    const stats = update.exerciseStats.get('bench');
    expect(update.exerciseStats.size).toBe(1);
    expect(stats?.bestSet?.weight?.value).toBe(225);
    expect(stats?.totalSessions).toBe(1);
  });
});

describe('previousSetAt', () => {
  const performance = {
    sessionId: 's1',
    performedOn: '2025-08-24',
    workoutId: 'push',
    workoutName: 'PUSH',
    prescription: null,
    sets: [set(0, 185, 10, 2), set(1, 185, 9, 1), set(2, 185, 8, 0)],
  };

  it('lines rows up by position', () => {
    expect(previousSetAt(performance, 1)?.reps).toBe(9);
  });

  it('gives a fourth set nothing rather than comparing it to the third', () => {
    expect(previousSetAt(performance, 3)).toBeNull();
  });

  it('positions by worked set, so a warmup does not shift the comparison', () => {
    const entry: SessionEntry = {
      slotId: 'slot-a',
      kind: 'exercise',
      exerciseId: 'bench',
      exerciseName: 'Bench Press',
      occurrenceIndex: 0,
      prescription: null,
      sets: [set(0, 95, 10, 6, { isWarmup: true }), set(1, 190, 10, 2), set(2, 190, 9, 1)],
      supersetGroup: null,
      notes: '',
    };

    expect(workedPosition(entry, 0)).toBeNull();
    expect(workedPosition(entry, 1)).toBe(0);
    expect(previousSetAt(performance, workedPosition(entry, 1) ?? 0)?.reps).toBe(10);
  });
});

describe('buildStatsUpdate', () => {
  it('writes nothing for tier 1 on an ad-hoc session, but still feeds tier 2', () => {
    const session = logged(
      { id: 's1', workoutId: null, workoutName: 'Ad-hoc session', performedOn: '2025-08-24' },
      { 'slot-a': [set(0, 100, 10, 2)] },
      [slot('slot-a', 'curl')],
    );
    const update = buildStatsUpdate(session, NO_PREVIOUS);

    expect(update.workoutStats).toBeNull();
    expect(update.exerciseStats.get('curl')?.lastWorkoutId).toBeNull();
  });

  it('skips rows with nothing performed, so an untouched exercise keeps its old overlay', () => {
    const session = logged(
      { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
      { 'slot-a': [set(0, 185, 8, 2)], 'slot-b': [emptySet(0), emptySet(1)] },
      [slot('slot-a', 'bench'), slot('slot-b', 'fly')],
    );
    const update = buildStatsUpdate(session, NO_PREVIOUS);

    expect(Object.keys(update.workoutStats?.byOccurrence ?? {})).toEqual(['bench#0']);
    expect(update.exerciseStats.has('fly')).toBe(false);
  });

  it('ignores rest rows entirely', () => {
    const session = logged(
      { id: 's1', workoutId: 'abs', workoutName: 'ABS', performedOn: '2025-08-24' },
      { 'slot-a': [set(0, 45, 20, 2)] },
      [
        slot('slot-a', 'crunch'),
        slot('slot-rest', '__rest__', { kind: 'rest', exerciseName: 'Rest' }),
      ],
    );
    const update = buildStatsUpdate(session, NO_PREVIOUS);

    expect(Object.keys(update.workoutStats?.byOccurrence ?? {})).toEqual(['crunch#0']);
    expect(update.exerciseStats.has('__rest__')).toBe(false);
  });

  it('strips warmups out of the stored performance', () => {
    const session = logged(
      { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
      { 'slot-a': [set(0, 95, 10, 6, { isWarmup: true }), set(1, 185, 8, 2)] },
      [slot('slot-a', 'bench')],
    );
    const stored = buildStatsUpdate(session, NO_PREVIOUS).workoutStats?.byOccurrence['bench#0'];

    expect(stored?.sets).toHaveLength(1);
    expect(stored?.sets[0]?.weight?.value).toBe(185);
  });

  it('overwrites tier 1, so an exercise dropped from the workout stops overlaying', () => {
    const first = buildStatsUpdate(
      logged(
        { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
        { 'slot-a': [set(0, 185, 8, 2)], 'slot-b': [set(0, 40, 12, 2)] },
        [slot('slot-a', 'bench'), slot('slot-b', 'fly')],
      ),
      NO_PREVIOUS,
    );
    const second = buildStatsUpdate(
      logged(
        { id: 's2', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-31' },
        { 'slot-a': [set(0, 190, 8, 2)] },
        [slot('slot-a', 'bench')],
      ),
      NO_PREVIOUS,
    );

    expect(Object.keys(first.workoutStats?.byOccurrence ?? {})).toContain('fly#0');
    expect(Object.keys(second.workoutStats?.byOccurrence ?? {})).not.toContain('fly#0');
  });
});

describe('PR detection', () => {
  const week1 = logged(
    { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
    { 'slot-a': [set(0, 185, 8, 2), set(1, 185, 7, 1)] },
    [slot('slot-a', 'bench')],
  );

  it('treats a first performance as a record', () => {
    const update = buildStatsUpdate(week1, NO_PREVIOUS);
    expect(update.prs.map((pr) => pr.exerciseId)).toEqual(['bench']);
    expect(update.prs[0]?.previousE1rmKg).toBe(0);
    expect(update.exerciseStats.get('bench')?.bestSet?.setIndex).toBe(0);
  });

  it('fires when a later session beats the stored best', () => {
    const first = buildStatsUpdate(week1, NO_PREVIOUS);
    const stored = first.exerciseStats.get('bench') ?? null;

    const week2 = logged(
      { id: 's2', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-31' },
      { 'slot-a': [set(0, 195, 8, 2)] },
      [slot('slot-a', 'bench')],
    );
    const update = buildStatsUpdate(week2, () => stored);

    expect(update.prs).toHaveLength(1);
    expect(update.exerciseStats.get('bench')?.bestSet?.weight?.value).toBe(195);
    expect(update.exerciseStats.get('bench')?.bestE1rmAt).toBe('2025-08-31');
    expect(update.exerciseStats.get('bench')?.totalSessions).toBe(2);
  });

  it('does not fire for repeating the same best set', () => {
    const stored = buildStatsUpdate(week1, NO_PREVIOUS).exerciseStats.get('bench') ?? null;
    const repeat = logged(
      { id: 's2', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-31' },
      { 'slot-a': [set(0, 185, 8, 2)] },
      [slot('slot-a', 'bench')],
    );
    const update = buildStatsUpdate(repeat, () => stored);

    expect(update.prs).toHaveLength(0);
    // The record and the set that made it are both left where they were.
    expect(update.exerciseStats.get('bench')?.bestE1rmSessionId).toBe('s1');
    expect(update.exerciseStats.get('bench')?.bestE1rmAt).toBe('2025-08-24');
  });

  it('does not fire for a heavier set that is worse once RIR is counted', () => {
    const stored = buildStatsUpdate(week1, NO_PREVIOUS).exerciseStats.get('bench') ?? null;
    // 195x5 @1 is 195x6 adjusted, below 185x8 @2 = 185x10 adjusted.
    const heavier = logged(
      { id: 's2', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-31' },
      { 'slot-a': [set(0, 195, 5, 1)] },
      [slot('slot-a', 'bench')],
    );
    const update = buildStatsUpdate(heavier, () => stored);

    expect(update.prs).toHaveLength(0);
  });

  it('detects a PR across units', () => {
    const stored = buildStatsUpdate(week1, NO_PREVIOUS).exerciseStats.get('bench') ?? null;
    const inKg = logged(
      { id: 's2', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-31' },
      { 'slot-a': [set(0, 90, 8, 2, { unit: 'kg' })] },
      [slot('slot-a', 'bench')],
    );
    const update = buildStatsUpdate(inKg, () => stored);

    // 90 kg is ~198 lb, comfortably over 185 lb at the same reps and RIR.
    expect(update.prs).toHaveLength(1);
    expect(update.exerciseStats.get('bench')?.bestSet?.weight).toEqual({ value: 90, unit: 'kg' });
  });

  it('does not double-count a session completed twice', () => {
    const first = buildStatsUpdate(week1, NO_PREVIOUS).exerciseStats.get('bench') ?? null;
    const again = buildStatsUpdate(week1, () => first);
    expect(again.exerciseStats.get('bench')?.totalSessions).toBe(1);
  });
});

describe('a workout changed between weeks', () => {
  /**
   * Week 1 does PUSH with bench and fly. The workout is then edited: fly is
   * replaced with incline, and bench moves. Week 2 must overlay bench against
   * week 1 while incline reads NEW, and week 1's own numbers stay intact.
   */
  const week1 = logged(
    { id: 's1', workoutId: 'push', workoutName: 'PUSH', performedOn: '2025-08-24' },
    { 'slot-bench': [set(0, 185, 8, 2)], 'slot-fly': [set(0, 40, 12, 2)] },
    [slot('slot-bench', 'bench'), slot('slot-fly', 'fly')],
  );
  const afterWeek1 = buildStatsUpdate(week1, NO_PREVIOUS);

  const week2Slots = [
    slot('slot-incline', 'incline'),
    // The same slot id: reordering and renaming the workout keeps it.
    slot('slot-bench', 'bench'),
  ];

  it('overlays the surviving exercise and marks the new one NEW', () => {
    const previous = (id: string): ExerciseStats | null => afterWeek1.exerciseStats.get(id) ?? null;

    const benchOverlay = resolveOverlay(
      week2Slots[1] ?? slot('x', 'bench'),
      afterWeek1.workoutStats,
      previous('bench'),
    );
    const inclineOverlay = resolveOverlay(
      week2Slots[0] ?? slot('x', 'incline'),
      afterWeek1.workoutStats,
      previous('incline'),
    );

    expect(benchOverlay.kind).toBe('same-workout');
    expect(benchOverlay.kind === 'same-workout' && benchOverlay.data.sets[0]?.reps).toBe(8);
    expect(inclineOverlay).toEqual({ kind: 'new' });
  });

  it('computes the delta against this workout own numbers', () => {
    const overlay = resolveOverlay(
      { exerciseId: 'bench', occurrenceIndex: 0 },
      afterWeek1.workoutStats,
      null,
    );
    expect(overlay.kind).toBe('same-workout');
    if (overlay.kind !== 'same-workout') return;

    const previous = previousSetAt(overlay.data, 0);
    expect(previous).not.toBeNull();
    if (previous === null) return;

    const chip = describeComparison(set(0, 190, 8, 2), previous, 'lb');
    expect(chip?.direction).toBe('up');
    expect(chip?.label).toBe('+5 lb');
  });

  it('leaves the dropped exercise history reachable through tier 2', () => {
    const fly = afterWeek1.exerciseStats.get('fly') ?? null;
    const overlay = resolveOverlay({ exerciseId: 'fly', occurrenceIndex: 0 }, null, fly);
    expect(overlay.kind).toBe('other-workout');
    expect(overlay.kind === 'other-workout' && overlay.data.workoutName).toBe('PUSH');
  });
});

describe('one continuous history for a workout done on different days', () => {
  /**
   * ABS after PUSH on Monday and after PULL on Wednesday. Because tier 1 keys
   * on the workout id and there is only one ABS document, the two performances
   * form a single chain — the reason a workout is top-level rather than a copy
   * inside a plan.
   */
  it('chains through the workout, not the day it was paired with', () => {
    const monday = buildStatsUpdate(
      logged(
        { id: 's1', workoutId: 'abs', workoutName: 'ABS', performedOn: '2025-08-25' },
        { 'slot-a': [set(0, 45, 20, 2)] },
        [slot('slot-a', 'crunch')],
      ),
      NO_PREVIOUS,
    );
    const wednesday = buildStatsUpdate(
      logged(
        { id: 's2', workoutId: 'abs', workoutName: 'ABS', performedOn: '2025-08-27' },
        { 'slot-a': [set(0, 50, 20, 2)] },
        [slot('slot-a', 'crunch')],
      ),
      (id) => monday.exerciseStats.get(id) ?? null,
    );

    expect(monday.workoutStats?.workoutId).toBe('abs');
    expect(wednesday.workoutStats?.workoutId).toBe('abs');
    expect(wednesday.exerciseStats.get('crunch')?.totalSessions).toBe(2);

    const overlay = resolveOverlay(
      { exerciseId: 'crunch', occurrenceIndex: 0 },
      wednesday.workoutStats,
      null,
    );
    expect(overlay.kind === 'same-workout' && overlay.data.performedOn).toBe('2025-08-27');
  });
});

describe('parsing stored stats', () => {
  it('keeps a well-formed workout stats document', () => {
    const stats = parseWorkoutStats('push', {
      workoutId: 'push',
      workoutName: 'PUSH',
      lastSessionId: 's1',
      lastPerformedOn: '2025-08-24',
      byOccurrence: {
        'bench#0': {
          sessionId: 's1',
          performedOn: '2025-08-24',
          workoutId: 'push',
          workoutName: 'PUSH',
          prescription: null,
          sets: [{ setIndex: 0, weight: { value: 185, unit: 'lb' }, reps: 8, rir: 2 }],
        },
      },
    });

    expect(stats.byOccurrence['bench#0']?.sets[0]?.reps).toBe(8);
  });

  it('drops a performance with no sets rather than letting it shadow tier 2', () => {
    const stats = parseWorkoutStats('push', {
      byOccurrence: { 'bench#0': { sessionId: 's1', performedOn: '2025-08-24', sets: [] } },
    });
    expect(stats.byOccurrence).toEqual({});
  });

  it('survives a garbage document', () => {
    const stats = parseWorkoutStats('push', { byOccurrence: 'nope', lastPerformedOn: 42 });
    expect(stats).toEqual({
      workoutId: 'push',
      workoutName: '',
      lastSessionId: '',
      lastPerformedOn: '',
      byOccurrence: {},
    });
  });

  it('reads an exercise stats document back', () => {
    const stats = parseExerciseStats('bench', {
      lastSessionId: 's1',
      lastPerformedOn: '2025-08-24',
      lastWorkoutId: 'push',
      lastWorkoutName: 'PUSH',
      lastSets: [{ setIndex: 0, weight: { value: 185, unit: 'lb' }, reps: 8, rir: 2 }],
      bestE1rm: 111.9,
      bestE1rmAt: '2025-08-24',
      bestE1rmSessionId: 's1',
      bestSet: { setIndex: 0, weight: { value: 185, unit: 'lb' }, reps: 8, rir: 2 },
      totalSessions: 3,
    });

    expect(stats.exerciseId).toBe('bench');
    expect(stats.bestSet?.reps).toBe(8);
    expect(stats.totalSessions).toBe(3);
    expect(adjustedE1rm(stats.bestSet ?? { weight: null, reps: null, rir: null })).toBeCloseTo(
      111.9,
      1,
    );
  });

  it('reads an empty document as no history at all', () => {
    const stats = parseExerciseStats('bench', {});
    expect(stats.bestE1rm).toBe(0);
    expect(stats.bestSet).toBeNull();
    expect(resolveOverlay({ exerciseId: 'bench', occurrenceIndex: 0 }, null, stats)).toEqual({
      kind: 'new',
    });
  });
});
