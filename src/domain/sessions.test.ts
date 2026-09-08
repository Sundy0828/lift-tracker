import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoggedSet, Session, SessionEntry } from './sessions';
import {
  addAdHocEntry,
  addSet,
  dateFromKey,
  daysBetween,
  emptySet,
  entriesFromBody,
  entryKey,
  exerciseEntries,
  isDateKey,
  isSessionFinished,
  localDateKey,
  newSession,
  nextOccurrenceInSession,
  parseSession,
  parseSessionEntry,
  performedSets,
  removeEntry,
  removeSet,
  restAfter,
  sessionProgress,
  toggleSetComplete,
  toggleSetSkipped,
  totalPerformedSets,
  updateSet,
  workingSets,
} from './sessions';
import type { ExerciseSlot, WorkoutBody } from './workouts';
import { DEFAULT_PRESCRIPTION, createRestSlot } from './workouts';

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

function body(slots: ExerciseSlot[], groupRest: Record<string, number | null> = {}): WorkoutBody {
  return { name: 'PUSH', slots, groupRest };
}

function start(bodyValue: WorkoutBody | null): Session {
  return newSession({
    sessionId: 's1',
    workoutId: bodyValue === null ? null : 'push',
    workoutVersion: bodyValue === null ? null : 2,
    workoutName: bodyValue === null ? 'Ad-hoc session' : 'PUSH',
    body: bodyValue,
    performedOn: '2025-08-24',
    startedAt: '2025-08-24T17:00:00.000Z',
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('localDateKey', () => {
  it('uses the local date, not the UTC one', () => {
    vi.useFakeTimers();
    // 22:30 in a zone five hours behind UTC is already tomorrow in UTC. The
    // session belongs to the day the lifter was in.
    vi.setSystemTime(new Date(2025, 7, 24, 22, 30));
    expect(localDateKey()).toBe('2025-08-24');
  });

  it('pads month and day', () => {
    expect(localDateKey(new Date(2025, 0, 5))).toBe('2025-01-05');
  });
});

describe('isDateKey', () => {
  it('accepts a real local date', () => {
    expect(isDateKey('2025-08-24')).toBe(true);
  });

  it('rejects a date that does not exist', () => {
    expect(isDateKey('2025-02-31')).toBe(false);
    expect(isDateKey('2025-13-01')).toBe(false);
  });

  it('rejects anything that is not the shape', () => {
    expect(isDateKey('24/08/2025')).toBe(false);
    expect(isDateKey('2025-8-4')).toBe(false);
    expect(isDateKey(20250824)).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts whole days in either direction', () => {
    expect(daysBetween('2025-08-24', '2025-08-31')).toBe(7);
    expect(daysBetween('2025-08-31', '2025-08-24')).toBe(-7);
    expect(daysBetween('2025-08-24', '2025-08-24')).toBe(0);
  });

  it('counts one day across a daylight-saving boundary', () => {
    // 23- and 25-hour days must still be one day apart, which is why the
    // difference is rounded rather than floored.
    expect(daysBetween('2025-03-08', '2025-03-09')).toBe(1);
    expect(daysBetween('2025-11-01', '2025-11-02')).toBe(1);
  });

  it('is null for a non-date', () => {
    expect(daysBetween('nope', '2025-08-24')).toBeNull();
    expect(dateFromKey('nope')).toBeNull();
  });
});

describe('entriesFromBody', () => {
  it('makes one row per slot with an empty set per prescribed set', () => {
    const entries = entriesFromBody(
      body([slot('a', 'bench', { prescription: { ...DEFAULT_PRESCRIPTION, sets: 4 } })]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.sets).toHaveLength(4);
    expect(entries[0]?.sets.map((set) => set.setIndex)).toEqual([0, 1, 2, 3]);
    expect(entries[0]?.sets.every((set) => set.weight === null && set.completedAt === null)).toBe(
      true,
    );
  });

  it('carries the prescription across so the row keeps what it was logged against', () => {
    const prescription = { ...DEFAULT_PRESCRIPTION, sets: 2, repRange: { min: 12, max: 20 } };
    const entries = entriesFromBody(body([slot('a', 'bench', { prescription })]));
    expect(entries[0]?.prescription).toEqual(prescription);
  });

  it('keeps rest rows, with no sets', () => {
    const entries = entriesFromBody(body([slot('a', 'bench'), createRestSlot('r1', 90)]));

    expect(entries).toHaveLength(2);
    expect(entries[1]?.kind).toBe('rest');
    expect(entries[1]?.sets).toEqual([]);
    expect(exerciseEntries(entries)).toHaveLength(1);
  });

  it('keeps circuit membership', () => {
    const entries = entriesFromBody(
      body([
        slot('a', 'bench', { supersetGroup: 'g1' }),
        slot('b', 'row', { supersetGroup: 'g1' }),
      ]),
    );
    expect(entries.map((entry) => entry.supersetGroup)).toEqual(['g1', 'g1']);
  });
});

describe('newSession', () => {
  it('stamps the local date and starts active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 7, 24, 18, 0));
    const session = newSession({
      sessionId: 's1',
      workoutId: 'push',
      workoutVersion: 2,
      workoutName: 'PUSH',
      body: body([slot('a', 'bench')]),
    });

    expect(session.status).toBe('active');
    expect(session.performedOn).toBe('2025-08-24');
    expect(session.completedAt).toBeNull();
    expect(session.workoutVersion).toBe(2);
  });

  it('starts empty for an ad-hoc session', () => {
    const session = start(null);
    expect(session.workoutId).toBeNull();
    expect(session.entries).toEqual([]);
    expect(session.groupRest).toEqual({});
  });

  it('copies the round rests, so a circuit paces correctly offline', () => {
    const session = start(body([slot('a', 'bench', { supersetGroup: 'g1' })], { g1: 150 }));
    expect(session.groupRest).toEqual({ g1: 150 });
  });
});

describe('editing sets', () => {
  const session = start(body([slot('a', 'bench'), slot('b', 'row')]));
  const entries = session.entries;

  it('updates one set and leaves the rest alone', () => {
    const next = updateSet(entries, 'a', 1, { weight: { value: 185, unit: 'lb' }, reps: 8 });

    expect(next[0]?.sets[1]?.weight).toEqual({ value: 185, unit: 'lb' });
    expect(next[0]?.sets[0]).toBe(entries[0]?.sets[0]);
    expect(next[1]).toBe(entries[1]);
  });

  it('clamps entered numbers so a fat-fingered figure cannot poison the stats', () => {
    const next = updateSet(entries, 'a', 0, { reps: 9999, rir: -4 });
    expect(next[0]?.sets[0]?.reps).toBe(100);
    expect(next[0]?.sets[0]?.rir).toBe(0);
  });

  it('rounds a decimal rep count', () => {
    expect(updateSet(entries, 'a', 0, { reps: 8.6 })[0]?.sets[0]?.reps).toBe(9);
  });

  it('drops a negative load rather than storing it', () => {
    const next = updateSet(entries, 'a', 0, { weight: { value: -10, unit: 'lb' } });
    expect(next[0]?.sets[0]?.weight).toBeNull();
  });

  it('adds a set, carrying the last worked load forward', () => {
    const filled = updateSet(entries, 'a', 2, { weight: { value: 185, unit: 'lb' }, reps: 8 });
    const next = addSet(filled, 'a');

    expect(next[0]?.sets).toHaveLength(4);
    expect(next[0]?.sets[3]?.weight).toEqual({ value: 185, unit: 'lb' });
    expect(next[0]?.sets[3]?.reps).toBe(8);
    expect(next[0]?.sets[3]?.completedAt).toBeNull();
  });

  it('adds an empty set when there is nothing to carry forward', () => {
    expect(addSet(entries, 'a')[0]?.sets[3]?.weight).toBeNull();
  });

  it('removes a set and renumbers the rest', () => {
    const next = removeSet(entries, 'a', 1);
    expect(next[0]?.sets.map((set) => set.setIndex)).toEqual([0, 1]);
  });

  it('keeps the last set, because a row with no sets cannot be logged', () => {
    let next = removeSet(entries, 'a', 2);
    next = removeSet(next, 'a', 1);
    next = removeSet(next, 'a', 0);
    expect(next[0]?.sets).toHaveLength(1);
  });

  it('completes and un-completes a set', () => {
    const done = toggleSetComplete(entries, 'a', 0, '2025-08-24T17:05:00.000Z');
    expect(done[0]?.sets[0]?.completedAt).toBe('2025-08-24T17:05:00.000Z');
    expect(toggleSetComplete(done, 'a', 0)[0]?.sets[0]?.completedAt).toBeNull();
  });

  it('un-skips a set when it is completed', () => {
    const skipped = toggleSetSkipped(entries, 'a', 0);
    expect(skipped[0]?.sets[0]?.skipped).toBe(true);

    const done = toggleSetComplete(skipped, 'a', 0, '2025-08-24T17:05:00.000Z');
    expect(done[0]?.sets[0]?.skipped).toBe(false);
    expect(done[0]?.sets[0]?.completedAt).not.toBeNull();
  });

  it('clears the completion when a completed set is skipped', () => {
    const done = toggleSetComplete(entries, 'a', 0, '2025-08-24T17:05:00.000Z');
    const skipped = toggleSetSkipped(done, 'a', 0);
    expect(skipped[0]?.sets[0]?.skipped).toBe(true);
    expect(skipped[0]?.sets[0]?.completedAt).toBeNull();
  });
});

describe('ad-hoc rows', () => {
  const session = start(body([slot('a', 'bench')]));

  it('adds a row with no slot id', () => {
    const next = addAdHocEntry(session.entries, {
      exerciseId: 'dips',
      exerciseName: 'Dips',
      sets: 2,
    });

    expect(next).toHaveLength(2);
    expect(next[1]?.slotId).toBeNull();
    expect(next[1]?.prescription).toBeNull();
    expect(next[1]?.sets).toHaveLength(2);
  });

  it('continues the workout occurrence numbering, so the two do not collide', () => {
    const next = addAdHocEntry(session.entries, { exerciseId: 'bench', exerciseName: 'bench' });

    expect(nextOccurrenceInSession(session.entries, 'bench')).toBe(1);
    expect(next[1]?.occurrenceIndex).toBe(1);
    expect(next.map(entryKey)).toEqual(['a', 'adhoc:bench#1']);
  });

  it('is removed by its key without touching the prescribed rows', () => {
    const withAdHoc = addAdHocEntry(session.entries, { exerciseId: 'dips', exerciseName: 'Dips' });
    expect(removeEntry(withAdHoc, 'adhoc:dips#0')).toEqual(session.entries);
  });

  it('takes edits by the same key as any other row', () => {
    const withAdHoc = addAdHocEntry(session.entries, { exerciseId: 'dips', exerciseName: 'Dips' });
    const next = updateSet(withAdHoc, 'adhoc:dips#0', 0, { reps: 12 });
    expect(next[1]?.sets[0]?.reps).toBe(12);
  });
});

describe('progress', () => {
  const session = start(body([slot('a', 'bench'), createRestSlot('r1'), slot('b', 'row')]));

  it('counts set rows, ignoring rest rows', () => {
    expect(sessionProgress(session.entries)).toEqual({ completed: 0, total: 6 });
  });

  it('counts a skipped set as dealt with', () => {
    const next = toggleSetSkipped(session.entries, 'a', 0);
    expect(sessionProgress(next).completed).toBe(1);
  });

  it('is finished once every set is completed or skipped', () => {
    let entries = session.entries;
    for (const key of ['a', 'b']) {
      for (const index of [0, 1, 2]) entries = toggleSetComplete(entries, key, index, 'now');
    }
    expect(isSessionFinished(entries)).toBe(true);
  });

  it('is not finished when there is nothing to do', () => {
    expect(isSessionFinished([])).toBe(false);
  });

  it('counts only sets with a load and reps as performed', () => {
    let entries = updateSet(session.entries, 'a', 0, {
      weight: { value: 185, unit: 'lb' },
      reps: 8,
    });
    entries = updateSet(entries, 'a', 1, { weight: { value: 185, unit: 'lb' } });
    expect(totalPerformedSets(entries)).toBe(1);
  });
});

describe('workingSets', () => {
  const sets: LoggedSet[] = [
    { ...emptySet(0, true), weight: { value: 95, unit: 'lb' }, reps: 10 },
    { ...emptySet(1), weight: { value: 185, unit: 'lb' }, reps: 8 },
    { ...emptySet(2), skipped: true },
  ];

  it('excludes warmups and skipped sets', () => {
    expect(workingSets(sets).map((set) => set.setIndex)).toEqual([1]);
    expect(performedSets(sets).map((set) => set.setIndex)).toEqual([1]);
  });
});

describe('restAfter', () => {
  const session = start(
    body(
      [
        slot('a', 'bench', {
          supersetGroup: 'g1',
          prescription: { ...DEFAULT_PRESCRIPTION, restSeconds: 0 },
        }),
        slot('b', 'row', {
          supersetGroup: 'g1',
          prescription: { ...DEFAULT_PRESCRIPTION, restSeconds: 0 },
        }),
        slot('c', 'fly', { prescription: { ...DEFAULT_PRESCRIPTION, restSeconds: 90 } }),
        slot('d', 'curl'),
      ],
      { g1: 150 },
    ),
  );

  function entry(key: string): SessionEntry {
    const found = session.entries.find((candidate) => entryKey(candidate) === key);
    if (found === undefined) throw new Error(`no entry ${key}`);
    return found;
  }

  it('uses the slot own rest', () => {
    expect(restAfter(session, entry('c'), 120)).toBe(90);
  });

  it('falls back to the profile default when the slot has none', () => {
    expect(restAfter(session, entry('d'), 120)).toBe(120);
  });

  it('flows between circuit members on their own rest', () => {
    expect(restAfter(session, entry('a'), 120)).toBe(0);
  });

  it('uses the round rest after the last member of a round', () => {
    expect(restAfter(session, entry('b'), 120, true)).toBe(150);
  });

  it('falls back to the default when a circuit has no round rest set', () => {
    const noRound: Session = { ...session, groupRest: { g1: null } };
    expect(restAfter(noRound, entry('b'), 120, true)).toBe(120);
  });
});

describe('parsing a stored session', () => {
  it('reads a well-formed document', () => {
    const session = parseSession('s1', {
      workoutId: 'push',
      workoutVersion: 2,
      workoutName: 'PUSH',
      status: 'completed',
      performedOn: '2025-08-24',
      startedAt: '2025-08-24T17:00:00.000Z',
      completedAt: '2025-08-24T18:00:00.000Z',
      entries: [
        {
          slotId: 'a',
          kind: 'exercise',
          exerciseId: 'bench',
          exerciseName: 'Bench Press',
          occurrenceIndex: 0,
          prescription: { sets: 3, repRange: { min: 8, max: 12 }, rirRange: { min: 1, max: 2 } },
          sets: [{ weight: { value: 185, unit: 'lb' }, reps: 8, rir: 2 }],
          supersetGroup: null,
          notes: '',
        },
      ],
      groupRest: { g1: 150 },
      bodyweight: { value: 182, unit: 'lb' },
      notes: 'felt strong',
    });

    expect(session.status).toBe('completed');
    expect(session.entries[0]?.sets[0]?.reps).toBe(8);
    expect(session.bodyweight).toEqual({ value: 182, unit: 'lb' });
    expect(session.groupRest).toEqual({ g1: 150 });
  });

  it('renumbers set indexes from position, so the overlay cannot line up wrong', () => {
    const session = parseSession('s1', {
      entries: [
        {
          exerciseId: 'bench',
          sets: [
            { setIndex: 7, reps: 8 },
            { setIndex: 7, reps: 6 },
          ],
        },
      ],
    });
    expect(session.entries[0]?.sets.map((set) => set.setIndex)).toEqual([0, 1]);
  });

  it('treats an unrecognised status as abandoned, never as the session to resume', () => {
    expect(parseSession('s1', { status: 'in-progress' }).status).toBe('abandoned');
    expect(parseSession('s1', {}).status).toBe('abandoned');
  });

  it('falls back to today when the date is unusable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 8, 8, 9, 0));
    expect(parseSession('s1', { performedOn: 'yesterday' }).performedOn).toBe('2025-09-08');
  });

  it('drops a row with no exercise identity', () => {
    expect(parseSessionEntry({ exerciseName: 'Mystery' })).toBeNull();
    expect(parseSession('s1', { entries: [{ exerciseName: 'Mystery' }] }).entries).toEqual([]);
  });

  it('leaves an ad-hoc row prescription null rather than inventing one', () => {
    const entry = parseSessionEntry({ exerciseId: 'dips', sets: [{ reps: 10 }] });
    expect(entry?.slotId).toBeNull();
    expect(entry?.prescription).toBeNull();
  });

  it('discards a bodyweight with an unknown unit', () => {
    expect(parseSession('s1', { bodyweight: { value: 82, unit: 'stone' } }).bodyweight).toBeNull();
  });
});
