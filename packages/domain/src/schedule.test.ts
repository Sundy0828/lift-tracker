import { describe, expect, it } from 'vitest';
import type { Schedule } from './schedule';
import {
  EMPTY_SCHEDULE,
  dayOfWeekFor,
  isEmpty,
  parseSchedule,
  prune,
  scheduledOn,
  setDay,
  weekdayName,
  withoutWorkout,
  workoutsOn,
} from './schedule';

const week: Schedule = {
  entries: [
    { dayOfWeek: 0, workoutId: 'push' },
    { dayOfWeek: 0, workoutId: 'abs' },
    { dayOfWeek: 2, workoutId: 'pull' },
    { dayOfWeek: 4, workoutId: 'legs' },
  ],
};

describe('dayOfWeekFor', () => {
  it('numbers Monday as 0, not Sunday', () => {
    // 2026-08-17 is a Monday.
    expect(dayOfWeekFor('2026-08-17')).toBe(0);
    expect(dayOfWeekFor('2026-08-23')).toBe(6);
  });

  it('refuses a key that is not a date', () => {
    expect(dayOfWeekFor('nonsense')).toBeNull();
  });
});

describe('reading a week', () => {
  it('lists a day in the order it was built', () => {
    expect(workoutsOn(week, 0)).toEqual(['push', 'abs']);
  });

  it('returns nothing for a rest day', () => {
    expect(workoutsOn(week, 1)).toEqual([]);
  });

  it('resolves a date to what that weekday is for', () => {
    expect(scheduledOn(week, '2026-08-19')).toEqual(['pull']);
    expect(scheduledOn(week, '2026-08-18')).toEqual([]);
  });

  it('knows an empty week from a full one', () => {
    expect(isEmpty(EMPTY_SCHEDULE)).toBe(true);
    expect(isEmpty(week)).toBe(false);
  });
});

describe('setDay', () => {
  it('replaces one day and leaves the others alone', () => {
    const next = setDay(week, 0, ['upper']);
    expect(workoutsOn(next, 0)).toEqual(['upper']);
    expect(workoutsOn(next, 2)).toEqual(['pull']);
  });

  it('clears a day', () => {
    expect(workoutsOn(setDay(week, 0, []), 0)).toEqual([]);
  });

  it('drops a duplicate, which would start one workout twice', () => {
    expect(workoutsOn(setDay(week, 1, ['push', 'push']), 1)).toEqual(['push']);
  });
});

describe('workouts that go away', () => {
  it('drops every reference to one workout', () => {
    const next = withoutWorkout(week, 'push');
    expect(next.entries.some((entry) => entry.workoutId === 'push')).toBe(false);
    expect(workoutsOn(next, 0)).toEqual(['abs']);
  });

  it('keeps only rows whose workout still exists', () => {
    expect(prune(week, new Set(['pull'])).entries).toEqual([{ dayOfWeek: 2, workoutId: 'pull' }]);
  });
});

describe('parseSchedule', () => {
  it('reads a document written by the app', () => {
    expect(parseSchedule({ entries: [{ dayOfWeek: 3, workoutId: 'push' }] })).toEqual({
      entries: [{ dayOfWeek: 3, workoutId: 'push' }],
    });
  });

  it('reads a missing document as an empty week', () => {
    expect(parseSchedule(undefined)).toEqual(EMPTY_SCHEDULE);
    expect(parseSchedule({})).toEqual(EMPTY_SCHEDULE);
  });

  it('drops a row with no usable day or workout', () => {
    const parsed = parseSchedule({
      entries: [
        { dayOfWeek: 7, workoutId: 'push' },
        { dayOfWeek: -1, workoutId: 'push' },
        { dayOfWeek: 1.5, workoutId: 'push' },
        { dayOfWeek: 1, workoutId: '' },
        { dayOfWeek: 1 },
        'nonsense',
        null,
        { dayOfWeek: 1, workoutId: 'pull' },
      ],
    });
    expect(parsed.entries).toEqual([{ dayOfWeek: 1, workoutId: 'pull' }]);
  });

  it('drops a row repeated inside one document', () => {
    const parsed = parseSchedule({
      entries: [
        { dayOfWeek: 1, workoutId: 'pull' },
        { dayOfWeek: 1, workoutId: 'pull' },
      ],
    });
    expect(parsed.entries).toHaveLength(1);
  });

  it('sorts the week into day order', () => {
    const parsed = parseSchedule({
      entries: [
        { dayOfWeek: 5, workoutId: 'a' },
        { dayOfWeek: 1, workoutId: 'b' },
      ],
    });
    expect(parsed.entries.map((entry) => entry.dayOfWeek)).toEqual([1, 5]);
  });
});

describe('weekdayName', () => {
  it('starts the week on Monday', () => {
    expect(weekdayName(0, 'long')).toMatch(/^M/u);
  });
});
