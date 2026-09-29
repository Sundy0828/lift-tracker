import { describe, expect, it } from 'vitest';
import {
  activityByDay,
  dayStop,
  firstTrainedDay,
  monthEnd,
  monthGrid,
  monthKeyOf,
  monthStart,
  periodTotals,
  shiftMonth,
  summariseSession,
  trainedWeeks,
  weekStreak,
  yearEnd,
  yearGrid,
  yearStart,
} from './calendar';
import type { LoggedSet, Session, SessionEntry } from './sessions';
import { emptySet } from './sessions';
import { DEFAULT_PRESCRIPTION } from './workouts';

function set(setIndex: number, weight: number | null, reps: number | null): LoggedSet {
  return {
    ...emptySet(setIndex),
    weight: weight === null ? null : { value: weight, unit: 'lb' },
    reps,
    completedAt: '2026-08-26T18:00:00.000Z',
  };
}

function entry(exerciseId: string, sets: LoggedSet[]): SessionEntry {
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
  };
}

/** One session an hour long, with `sets` working sets in it. */
function session(id: string, performedOn: string, sets = 3, overrides: Partial<Session> = {}) {
  return {
    id,
    workoutId: 'push',
    workoutVersion: 1,
    workoutName: 'PUSH',
    status: 'completed',
    performedOn,
    startedAt: `${performedOn}T18:00:00.000Z`,
    completedAt: `${performedOn}T19:00:00.000Z`,
    entries: [
      entry(
        'bench',
        Array.from({ length: sets }, (_, index) => set(index, 185, 8)),
      ),
    ],
    groupRest: {},
    bodyweight: null,
    notes: '',
    ...overrides,
  } satisfies Session;
}

/** The calendar reads summaries, not sessions — this is the step between. */
function days(sessions: readonly Session[]) {
  return activityByDay(sessions.map(summariseSession));
}

describe('summariseSession', () => {
  it('keeps the numbers a square needs, and no sets', () => {
    const summary = summariseSession(session('a', '2026-08-26', 3));

    expect(summary.sessionId).toBe('a');
    expect(summary.performedOn).toBe('2026-08-26');
    expect(summary.seconds).toBe(3600);
    expect(summary.sets).toBe(3);
    expect(summary.volumeLoadKg).toBeGreaterThan(0);
  });
});

describe('activityByDay', () => {
  it('rolls two sessions on one day into one entry', () => {
    const byDay = days([
      session('a', '2026-08-26', 3),
      session('b', '2026-08-26', 4),
      session('c', '2026-08-27', 2),
    ]);

    expect(byDay.get('2026-08-26')).toMatchObject({ sessions: 2, sets: 7, seconds: 7200 });
    expect(byDay.get('2026-08-27')).toMatchObject({ sessions: 1, sets: 2 });
  });

  it('counts no time for a session that never finished', () => {
    const open = session('a', '2026-08-26', 3, { status: 'abandoned', completedAt: null });
    expect(days([open]).get('2026-08-26')?.seconds).toBe(0);
  });

  it('drops a session whose date key will not parse', () => {
    expect(days([session('a', 'not-a-date')]).size).toBe(0);
  });
});

describe('periodTotals', () => {
  const byDay = days([
    session('a', '2026-08-26', 3),
    session('b', '2026-09-02', 4),
    session('c', '2026-09-30', 5),
  ]);

  it('counts both bounds as inclusive', () => {
    expect(periodTotals(byDay, '2026-09-01', '2026-09-30')).toMatchObject({
      sessions: 2,
      sets: 9,
      days: 2,
    });
  });

  it('treats a null bound as open', () => {
    expect(periodTotals(byDay, null, null)).toMatchObject({ sessions: 3, sets: 12, days: 3 });
  });

  it('counts distinct days, not sessions', () => {
    const twice = days([session('a', '2026-08-26'), session('b', '2026-08-26')]);
    expect(periodTotals(twice, null, null)).toMatchObject({ sessions: 2, days: 1 });
  });

  it('reports the first day anything was logged', () => {
    expect(firstTrainedDay(byDay)).toBe('2026-08-26');
    expect(firstTrainedDay(new Map())).toBeNull();
  });
});

describe('months', () => {
  it('reads a month key off a date key', () => {
    expect(monthKeyOf('2026-08-26')).toBe('2026-08');
  });

  it('finds the last day of a month without a table', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2026-08')).toBe('2026-08-31');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });

  it('carries a shift across the year boundary in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-06', 12)).toBe('2027-06');
    expect(shiftMonth('2026-06', -18)).toBe('2024-12');
  });

  it('leaves a key it cannot read alone', () => {
    expect(shiftMonth('nonsense', 1)).toBe('nonsense');
  });

  it('brackets a year', () => {
    expect(monthStart('2026-01')).toBe('2026-01-01');
    expect(yearStart(2026)).toBe('2026-01-01');
    expect(yearEnd(2026)).toBe('2026-12-31');
  });
});

describe('monthGrid', () => {
  it('starts every row on a Monday', () => {
    // 2026-08-01 is a Saturday, so the first row begins on 2026-07-27.
    const weeks = monthGrid('2026-08');
    expect(weeks[0]?.weekStart).toBe('2026-07-27');
    for (const week of weeks) expect(week.days).toHaveLength(7);
  });

  it('blanks the days either side of the month', () => {
    const weeks = monthGrid('2026-08');
    expect(weeks[0]?.days.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(weeks[0]?.days[5]).toBe('2026-08-01');
  });

  it('covers every day of the month exactly once', () => {
    const grid = monthGrid('2026-08')
      .flatMap((week) => week.days)
      .filter((day): day is string => day !== null);
    expect(grid).toHaveLength(31);
    expect(new Set(grid).size).toBe(31);
  });

  it('handles a month that starts on a Monday', () => {
    // 2026-06-01 is a Monday.
    const weeks = monthGrid('2026-06');
    expect(weeks[0]?.days[0]).toBe('2026-06-01');
  });
});

describe('yearGrid', () => {
  it('is whole Monday-first week columns, seven days deep', () => {
    const weeks = yearGrid(2026);
    for (const week of weeks) expect(week.days).toHaveLength(7);
    // 2026-01-01 is a Thursday, so the first column starts the Monday before.
    expect(weeks[0]?.weekStart).toBe('2025-12-29');
  });

  it('covers every day of the year exactly once', () => {
    const days = yearGrid(2026)
      .flatMap((week) => week.days)
      .filter((day): day is string => day !== null);
    expect(days).toHaveLength(365);
    expect(new Set(days).size).toBe(365);
  });

  it('covers a leap year', () => {
    const days = yearGrid(2024)
      .flatMap((week) => week.days)
      .filter((day) => day !== null);
    expect(days).toHaveLength(366);
  });

  it('blanks the days that belong to the neighbouring years', () => {
    const [first] = yearGrid(2026);
    // Monday to Wednesday are still 2025, so the column starts blank.
    expect(first?.days.slice(0, 3)).toEqual([null, null, null]);
    expect(first?.days[3]).toBe('2026-01-01');
  });

  it('splits into two bands of about twenty-seven columns', () => {
    // What the year view relies on to fit a phone without scrolling.
    const weeks = yearGrid(2026);
    expect(weeks.length).toBeGreaterThanOrEqual(52);
    expect(Math.ceil(weeks.length / 2)).toBeLessThanOrEqual(27);
  });
});

describe('weekStreak', () => {
  /** Monday 2026-08-03, 2026-08-10, 2026-08-17 are consecutive weeks. */
  it('counts consecutive weeks back from the most recent one', () => {
    const byDay = days([
      session('a', '2026-08-03'),
      session('b', '2026-08-12'),
      session('c', '2026-08-17'),
    ]);
    expect(weekStreak(byDay, '2026-08-19')).toMatchObject({ current: 3, best: 3 });
  });

  it('does not count the current week against you while it is still running', () => {
    const byDay = days([session('a', '2026-08-10'), session('b', '2026-08-17')]);
    // 2026-08-24 is the Monday after; nothing is logged in it yet.
    expect(weekStreak(byDay, '2026-08-25')).toMatchObject({
      current: 2,
      best: 2,
      trainedThisWeek: false,
    });
  });

  it('ends the run once a whole week has been missed', () => {
    const byDay = days([session('a', '2026-08-10'), session('b', '2026-08-17')]);
    expect(weekStreak(byDay, '2026-09-02')).toMatchObject({ current: 0, best: 2 });
  });

  it('keeps the best run after the current one ends', () => {
    const byDay = days([
      session('a', '2026-06-01'),
      session('b', '2026-06-08'),
      session('c', '2026-06-15'),
      session('d', '2026-08-17'),
    ]);
    expect(weekStreak(byDay, '2026-08-19')).toMatchObject({ current: 1, best: 3 });
  });

  it('says nothing at all for an empty history', () => {
    expect(weekStreak(new Map(), '2026-08-19')).toEqual({
      current: 0,
      best: 0,
      trainedThisWeek: false,
    });
  });

  it('counts two sessions in one week as one week', () => {
    const byDay = days([session('a', '2026-08-17'), session('b', '2026-08-19')]);
    expect(trainedWeeks(byDay)).toEqual(['2026-08-17']);
    expect(weekStreak(byDay, '2026-08-20')).toMatchObject({ current: 1, trainedThisWeek: true });
  });
});

describe('dayStop', () => {
  it('reads an untrained day as nothing rather than as a light one', () => {
    expect(dayStop(0)).toBe(0);
    expect(dayStop(1)).toBe(1);
  });

  it('bands on absolute set counts, so a light month looks light', () => {
    expect(dayStop(9)).toBe(1);
    expect(dayStop(10)).toBe(2);
    expect(dayStop(18)).toBe(3);
    expect(dayStop(28)).toBe(4);
    expect(dayStop(60)).toBe(4);
  });
});
