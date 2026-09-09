import { describe, expect, it } from 'vitest';
import {
  addDays,
  exercisePerformances,
  filterByWorkout,
  formatElapsed,
  formatSetCount,
  formatVolumeLoad,
  formatWeekLabel,
  groupByWeek,
  recordMilestones,
  sessionDurationSeconds,
  sessionTotals,
  volumeLoadKg,
  weekEndOf,
  weekStartOf,
  weeksBetween,
  workoutFilterOptions,
} from './history';
import type { LoggedSet, Session, SessionEntry } from './sessions';
import { emptySet } from './sessions';
import type { Unit } from './types';
import { DEFAULT_PRESCRIPTION } from './workouts';

function set(
  setIndex: number,
  weight: number | null,
  reps: number | null,
  rir: number | null = null,
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

function entry(exerciseId: string, sets: LoggedSet[], overrides: Partial<SessionEntry> = {}) {
  return {
    slotId: `slot-${exerciseId}`,
    kind: 'exercise',
    exerciseId,
    exerciseName: exerciseId,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION, sets: sets.length },
    sets,
    supersetGroup: null,
    notes: '',
    ...overrides,
  } satisfies SessionEntry;
}

function session(
  id: string,
  performedOn: string,
  entries: SessionEntry[],
  overrides: Partial<Session> = {},
): Session {
  return {
    id,
    workoutId: 'push',
    workoutVersion: 1,
    workoutName: 'PUSH',
    status: 'completed',
    performedOn,
    startedAt: `${performedOn}T18:00:00.000Z`,
    completedAt: `${performedOn}T19:00:00.000Z`,
    entries,
    groupRest: {},
    bodyweight: null,
    notes: '',
    ...overrides,
  };
}

describe('weeks', () => {
  it('buckets a Wednesday onto its Monday', () => {
    expect(weekStartOf('2025-08-27')).toBe('2025-08-25');
  });

  it('treats Sunday as the end of the week, not the start', () => {
    expect(weekStartOf('2025-08-31')).toBe('2025-08-25');
    expect(weekEndOf('2025-08-25')).toBe('2025-08-31');
  });

  it('keeps a Monday on itself', () => {
    expect(weekStartOf('2025-08-25')).toBe('2025-08-25');
  });

  it('crosses a year boundary without an ISO week-number rule', () => {
    // 2026-01-01 is a Thursday, so its week began in the previous year.
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29');
  });

  it('rejects a string that is not a date key at all', () => {
    expect(weekStartOf('not-a-date')).toBeNull();
    expect(addDays('nope', 1)).toBeNull();
  });

  it('rolls an out-of-range day over, matching dateFromKey', () => {
    // Not validation — `isDateKey` is what rejects 2025-02-31. Shifting one is
    // still well defined, and history never sees one: they cannot be written.
    expect(addDays('2025-02-31', 1)).toBe('2025-03-04');
  });

  it('counts whole weeks between Mondays', () => {
    expect(weeksBetween('2025-08-11', '2025-08-25')).toBe(2);
    expect(weeksBetween('2025-08-25', '2025-08-11')).toBe(-2);
  });
});

describe('formatWeekLabel', () => {
  it('names the current and previous weeks relatively', () => {
    expect(formatWeekLabel('2025-08-25', '2025-08-27')).toBe('This week');
    expect(formatWeekLabel('2025-08-18', '2025-08-27')).toBe('Last week');
  });

  it('falls back to a date range further back', () => {
    expect(formatWeekLabel('2025-08-04', '2025-08-27')).toContain('–');
  });
});

describe('volumeLoadKg', () => {
  it('multiplies load by reps across performed sets', () => {
    // 100 kg × 5 + 100 kg × 3
    const load = volumeLoadKg([
      set(0, 100, 5, null, { unit: 'kg' }),
      set(1, 100, 3, null, { unit: 'kg' }),
    ]);
    expect(load).toBeCloseTo(800);
  });

  it('ignores warmups, skipped sets and sets with no load', () => {
    const load = volumeLoadKg([
      set(0, 100, 5, null, { unit: 'kg', isWarmup: true }),
      set(1, 100, 5, null, { unit: 'kg', skipped: true }),
      set(2, null, 12),
    ]);
    expect(load).toBe(0);
  });

  it('normalises mixed units before summing', () => {
    // 100 kg × 1 plus 220.462 lb × 1 is two hundred kilos, not two hundred and
    // twenty of something.
    const load = volumeLoadKg([set(0, 100, 1, null, { unit: 'kg' }), set(1, 220.462, 1)]);
    expect(load).toBeCloseTo(200, 2);
  });
});

describe('sessionTotals', () => {
  it('counts sets that were done, including a bodyweight set with no load', () => {
    const totals = sessionTotals(
      session('s1', '2025-08-27', [
        entry('pullup', [set(0, null, 10), set(1, null, 8)]),
        entry('bench', [set(0, 100, 5, null, { unit: 'kg' })]),
      ]),
    );
    expect(totals.sets).toBe(3);
    expect(totals.exercises).toBe(2);
    expect(totals.volumeLoadKg).toBeCloseTo(500);
  });

  it('excludes a rest row from the exercise count', () => {
    const totals = sessionTotals(
      session('s1', '2025-08-27', [
        entry('bench', [set(0, 100, 5, null, { unit: 'kg' })]),
        entry('rest', [], { kind: 'rest' }),
      ]),
    );
    expect(totals.exercises).toBe(1);
  });

  it('does not count an exercise with nothing logged', () => {
    const totals = sessionTotals(
      session('s1', '2025-08-27', [entry('bench', [emptySet(0), emptySet(1)])]),
    );
    expect(totals).toEqual({ sets: 0, exercises: 0, volumeLoadKg: 0 });
  });
});

describe('groupByWeek', () => {
  const sessions = [
    session('a', '2025-08-25', [entry('bench', [set(0, 100, 5, null, { unit: 'kg' })])]),
    session('b', '2025-08-27', [entry('bench', [set(0, 100, 5, null, { unit: 'kg' })])]),
    session('c', '2025-09-02', [entry('bench', [set(0, 100, 5, null, { unit: 'kg' })])]),
  ];

  it('groups on the Monday and orders newest week first', () => {
    const weeks = groupByWeek(sessions);
    expect(weeks.map((week) => week.weekStart)).toEqual(['2025-09-01', '2025-08-25']);
  });

  it('orders sessions newest first inside a week', () => {
    const weeks = groupByWeek(sessions);
    expect(weeks[1]?.sessions.map((one) => one.id)).toEqual(['b', 'a']);
  });

  it('totals the week', () => {
    const weeks = groupByWeek(sessions);
    expect(weeks[1]?.totals).toEqual({
      sessions: 2,
      sets: 2,
      exercises: 2,
      volumeLoadKg: 1000,
    });
  });

  it('drops a session whose date key is unusable rather than inventing a week', () => {
    const weeks = groupByWeek([session('bad', 'whenever', [])]);
    expect(weeks).toEqual([]);
  });
});

describe('exercisePerformances', () => {
  const push = session('p1', '2025-08-25', [entry('bench', [set(0, 100, 5, 1, { unit: 'kg' })])]);
  const chest = session('c1', '2025-08-28', [entry('bench', [set(0, 90, 8, 2, { unit: 'kg' })])], {
    workoutId: 'chest',
    workoutName: 'CHEST + DELTS',
  });
  const later = session('p2', '2025-09-01', [entry('bench', [set(0, 105, 5, 1, { unit: 'kg' })])]);

  it('returns one performance per session, oldest first', () => {
    const performances = exercisePerformances([later, chest, push], 'bench');
    expect(performances.map((one) => one.sessionId)).toEqual(['p1', 'c1', 'p2']);
  });

  it('collapses two occurrences in one session into one performance', () => {
    const doubled = session('d1', '2025-08-25', [
      entry('bench', [set(0, 100, 5, null, { unit: 'kg' })]),
      entry('bench', [set(0, 70, 12, null, { unit: 'kg' })], {
        slotId: 'slot-backoff',
        occurrenceIndex: 1,
      }),
    ]);
    const performances = exercisePerformances([doubled], 'bench');
    expect(performances).toHaveLength(1);
    expect(performances[0]?.sets).toHaveLength(2);
    // The day's best set wins whichever slot produced it.
    expect(performances[0]?.best?.reps).toBe(5);
  });

  it('skips a session where the exercise was logged but nothing was done', () => {
    const skipped = session('s1', '2025-08-25', [
      entry('bench', [{ ...emptySet(0), skipped: true }]),
    ]);
    expect(exercisePerformances([skipped], 'bench')).toEqual([]);
  });

  it('keeps a bodyweight performance even though it cannot be scored', () => {
    const bodyweight = session('bw', '2025-08-25', [entry('pullup', [set(0, null, 10)])]);
    const performances = exercisePerformances([bodyweight], 'pullup');
    expect(performances).toHaveLength(1);
    expect(performances[0]?.e1rmKg).toBeNull();
  });

  it('separates PUSH bench from CHEST-day bench under the filter', () => {
    const performances = exercisePerformances([push, chest, later], 'bench');
    expect(filterByWorkout(performances, 'push').map((one) => one.sessionId)).toEqual(['p1', 'p2']);
    expect(filterByWorkout(performances, 'chest').map((one) => one.sessionId)).toEqual(['c1']);
    expect(filterByWorkout(performances, null)).toHaveLength(3);
  });

  it('offers each workout once, commonest first, under its current name', () => {
    const renamed = session(
      'p3',
      '2025-09-08',
      [entry('bench', [set(0, 110, 5, null, { unit: 'kg' })])],
      { workoutName: 'PUSH DAY' },
    );
    const options = workoutFilterOptions(
      exercisePerformances([push, chest, later, renamed], 'bench'),
    );
    expect(options).toEqual([
      { workoutId: 'push', workoutName: 'PUSH DAY', count: 3 },
      { workoutId: 'chest', workoutName: 'CHEST + DELTS', count: 1 },
    ]);
  });

  it('buckets ad-hoc performances under a null workout', () => {
    const adhoc = session(
      'a1',
      '2025-08-26',
      [entry('bench', [set(0, 80, 5, null, { unit: 'kg' })])],
      {
        workoutId: null,
        workoutVersion: null,
        workoutName: 'Ad-hoc session',
      },
    );
    const options = workoutFilterOptions(exercisePerformances([adhoc], 'bench'));
    expect(options[0]?.workoutId).toBeNull();
  });
});

describe('recordMilestones', () => {
  const performances = (loads: [string, number, number][]) =>
    exercisePerformances(
      loads.map(([date, weight, reps], index) =>
        session(`s${String(index)}`, date, [
          entry('bench', [set(0, weight, reps, 0, { unit: 'kg' })]),
        ]),
      ),
      'bench',
    );

  it('reports only the sessions where the record moved, newest first', () => {
    const milestones = recordMilestones(
      performances([
        ['2025-08-04', 100, 5],
        ['2025-08-11', 95, 5],
        ['2025-08-18', 105, 5],
      ]),
    );
    expect(milestones.map((one) => one.performance.performedOn)).toEqual([
      '2025-08-18',
      '2025-08-04',
    ]);
  });

  it('gives the first performance a previous record of zero', () => {
    const milestones = recordMilestones(performances([['2025-08-04', 100, 5]]));
    expect(milestones[0]?.previousE1rmKg).toBe(0);
  });

  it('does not count matching your best exactly as a new record', () => {
    const milestones = recordMilestones(
      performances([
        ['2025-08-04', 100, 5],
        ['2025-08-11', 100, 5],
      ]),
    );
    expect(milestones).toHaveLength(1);
  });

  it('scores on RIR-adjusted e1RM, so a heavier easy set can still win', () => {
    // 100 × 5 @ 3 RIR estimates as 100 × 8; 102.5 × 5 @ 0 RIR does not beat it.
    const sessions = [
      session('easy', '2025-08-04', [entry('bench', [set(0, 100, 5, 3, { unit: 'kg' })])]),
      session('hard', '2025-08-11', [entry('bench', [set(0, 102.5, 5, 0, { unit: 'kg' })])]),
    ];
    const milestones = recordMilestones(exercisePerformances(sessions, 'bench'));
    expect(milestones.map((one) => one.performance.sessionId)).toEqual(['easy']);
  });
});

describe('sessionDurationSeconds', () => {
  it('measures a finished session start to finish', () => {
    const finished = session('s1', '2025-08-27', [], {
      startedAt: '2025-08-27T18:00:00.000Z',
      completedAt: '2025-08-27T19:12:00.000Z',
    });
    expect(sessionDurationSeconds(finished)).toBe(72 * 60);
  });

  it('reports nothing for a session that never finished', () => {
    // Delegating to `sessionSeconds` here would measure against *now*, so a
    // session abandoned by a crash last March would claim months of lifting.
    const abandoned = session('s1', '2025-03-01', [], {
      status: 'abandoned',
      startedAt: '2025-03-01T18:00:00.000Z',
      completedAt: null,
    });
    expect(sessionDurationSeconds(abandoned)).toBeNull();
  });

  it('reports nothing when there is no start time either', () => {
    const odd = session('s1', '2025-08-27', [], { startedAt: null, completedAt: null });
    expect(sessionDurationSeconds(odd)).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('renders under an hour in minutes', () => {
    expect(formatElapsed(48 * 60)).toBe('48m');
  });

  it('splits an hour and minutes, with the unit on the number', () => {
    // `workouts.formatDuration` would render this as 75:00, which invites
    // being read as seventy-five seconds.
    expect(formatElapsed(75 * 60)).toBe('1h 15m');
  });

  it('drops a zero minute part', () => {
    expect(formatElapsed(120 * 60)).toBe('2h');
  });

  it('does not round a real session down to nothing', () => {
    expect(formatElapsed(20)).toBe('< 1m');
    expect(formatElapsed(0)).toBe('< 1m');
  });
});

describe('formatting', () => {
  it('renders tonnage in the display unit, grouped and whole', () => {
    expect(formatVolumeLoad(1000, 'kg')).toBe('1,000 kg');
  });

  it('singularises one set', () => {
    expect(formatSetCount(1)).toBe('1 set');
    expect(formatSetCount(12)).toBe('12 sets');
  });
});
