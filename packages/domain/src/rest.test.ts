import { describe, expect, it } from 'vitest';
import { REST_ALERT_LIMIT, restAlertOffsets, restPlan, restTag, restToResume } from './rest';
import type { Session } from './sessions';
import { newSession, toggleSetComplete, updateSet } from './sessions';
import type { ExerciseSlot, WorkoutBody } from './workouts';
import { DEFAULT_PRESCRIPTION } from './workouts';

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
    prescription: { ...DEFAULT_PRESCRIPTION, sets: 2, restSeconds: 90 },
    supersetGroup: null,
    notes: '',
    ...overrides,
  };
}

function start(slots: ExerciseSlot[], groupRest: Record<string, number | null> = {}): Session {
  const body: WorkoutBody = { name: 'PUSH', slots, groupRest };
  return newSession({
    sessionId: 's1',
    workoutId: 'push',
    workoutVersion: 1,
    workoutName: 'PUSH',
    body,
    performedOn: '2025-08-24',
    startedAt: '2025-08-24T17:00:00.000Z',
  });
}

const FINISHED = '2025-08-24T17:05:00.000Z';
const finishedMs = Date.parse(FINISHED);

describe('restAlertOffsets', () => {
  it('announces at the deadline, then repeats a fixed gap apart', () => {
    expect(restAlertOffsets()).toEqual([0, 25, 50]);
    expect(restAlertOffsets()).toHaveLength(REST_ALERT_LIMIT);
  });
});

describe('restPlan', () => {
  const session = start([slot('a', 'bench'), slot('b', 'row')]);

  it("names the set's rest and the exercise still to do", () => {
    expect(restPlan(session, session.entries, 'a', 120)).toEqual({
      seconds: 90,
      nextExerciseName: 'bench',
    });
  });

  it('says nothing is next once every set is dealt with', () => {
    let entries = session.entries;
    for (const key of ['a', 'b']) {
      for (const index of [0, 1]) entries = toggleSetComplete(entries, key, index, FINISHED);
    }
    expect(restPlan(session, entries, 'b', 120)?.nextExerciseName).toBeNull();
  });

  it('is null for a row that is not in the session', () => {
    expect(restPlan(session, session.entries, 'missing', 120)).toBeNull();
  });
});

describe('restToResume', () => {
  const session = start([slot('a', 'bench'), slot('b', 'row')]);
  const ticked = toggleSetComplete(session.entries, 'a', 0, FINISHED);

  it('is null when no set has been finished', () => {
    expect(restToResume(session, session.entries, 120, finishedMs)).toBeNull();
  });

  /**
   * The case it exists for: the app was killed thirty seconds into a
   * ninety-second rest, and is opened again.
   */
  it('rebuilds a rest still running from when the set was finished', () => {
    expect(restToResume(session, ticked, 120, finishedMs + 30_000)).toEqual({
      seconds: 90,
      nextExerciseName: 'bench',
      owner: { entryKey: 'a', setIndex: 0 },
      startedAt: FINISHED,
      endsAt: finishedMs + 90_000,
    });
  });

  it('is null once the rest has run out', () => {
    expect(restToResume(session, ticked, 120, finishedMs + 90_000)).toBeNull();
  });

  it('is null for a rest that was already ended and measured', () => {
    const ended = updateSet(ticked, 'a', 0, { restTakenSeconds: 40 });
    expect(restToResume(session, ended, 120, finishedMs + 30_000)).toBeNull();
  });

  /** The case found on a phone: tick, rest, untick, tick again, kill. */
  it('resumes a set ticked again after its earlier rest was measured', () => {
    let entries = updateSet(ticked, 'a', 0, { restTakenSeconds: 24 });
    entries = toggleSetComplete(entries, 'a', 0);
    const again = finishedMs + 60_000;
    entries = toggleSetComplete(entries, 'a', 0, new Date(again).toISOString());
    expect(restToResume(session, entries, 120, again + 10_000)?.endsAt).toBe(again + 90_000);
  });

  it('is null for a zero rest, a circuit flowing into its next exercise', () => {
    const circuit = start([
      slot('a', 'bench', {
        supersetGroup: 'g1',
        prescription: { ...DEFAULT_PRESCRIPTION, sets: 2, restSeconds: 0 },
      }),
      slot('b', 'row', { supersetGroup: 'g1' }),
    ]);
    const entries = toggleSetComplete(circuit.entries, 'a', 0, FINISHED);
    expect(restToResume(circuit, entries, 120, finishedMs + 1000)).toBeNull();
  });
});

/**
 * A rest adjusted with −15s/+15s before the app was killed. Only the deadline
 * scheduled with the OS remembers the adjustment.
 */
describe('restToResume with a deadline that survived the app', () => {
  const session = start([slot('a', 'bench'), slot('b', 'row')]);
  const ticked = toggleSetComplete(session.entries, 'a', 0, FINISHED);

  it('keeps a rest that was shortened', () => {
    const shortened = finishedMs + 60_000;
    const owed = restToResume(session, ticked, 120, finishedMs + 30_000, shortened);
    expect(owed?.endsAt).toBe(shortened);
    expect(owed?.seconds).toBe(60);
  });

  it('keeps a rest that was extended past the plan', () => {
    const extended = finishedMs + 120_000;
    // 100 s in: the planned 90 s are over, the extended rest is not.
    const owed = restToResume(session, ticked, 120, finishedMs + 100_000, extended);
    expect(owed?.endsAt).toBe(extended);
  });

  it('is null once that deadline has passed', () => {
    expect(restToResume(session, ticked, 120, finishedMs + 70_000, finishedMs + 60_000)).toBeNull();
  });

  it('ignores a deadline from before the set was finished', () => {
    const owed = restToResume(session, ticked, 120, finishedMs + 30_000, finishedMs - 1000);
    expect(owed?.endsAt).toBe(finishedMs + 90_000);
  });
});

describe('restTag', () => {
  it('names the set a rest belongs to', () => {
    expect(restTag({ entryKey: 'a', setIndex: 2 })).toBe('a#2');
  });
});
