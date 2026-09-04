import { describe, expect, it } from 'vitest';
import {
  changesByWorkout,
  cloneWorkouts,
  diffPlans,
  diffPrescriptions,
  plansEqual,
  summarize,
} from './planDiff';
import type { PlanExerciseSlot, PlanWorkout, Prescription } from './plans';
import { DEFAULT_PRESCRIPTION } from './plans';

function slot(
  slotId: string,
  exerciseName: string,
  overrides: Partial<PlanExerciseSlot> = {},
): PlanExerciseSlot {
  return {
    slotId,
    exerciseId: exerciseName.toLowerCase().replace(/\s+/gu, '_'),
    exerciseName,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION },
    supersetGroup: null,
    notes: '',
    ...overrides,
  };
}

function workout(workoutId: string, name: string, slots: PlanExerciseSlot[]): PlanWorkout {
  return { workoutId, name, slots };
}

const withSets = (sets: number): Prescription => ({ ...DEFAULT_PRESCRIPTION, sets });

const PUSH = workout('w1', 'PUSH', [
  slot('s1', 'Bench Press', { prescription: withSets(3) }),
  slot('s2', 'Cable Fly'),
]);

describe('diffPrescriptions', () => {
  it('reports no change for identical prescriptions', () => {
    expect(diffPrescriptions(DEFAULT_PRESCRIPTION, { ...DEFAULT_PRESCRIPTION })).toEqual([]);
  });

  it('reports a set count change', () => {
    expect(diffPrescriptions(withSets(3), withSets(4))).toEqual([
      { field: 'sets', before: '3', after: '4' },
    ]);
  });

  it('reports a rep range change as a range', () => {
    const after: Prescription = { ...DEFAULT_PRESCRIPTION, repRange: { min: 12, max: 20 } };
    expect(diffPrescriptions(DEFAULT_PRESCRIPTION, after)).toEqual([
      { field: 'reps', before: '8-12', after: '12-20' },
    ]);
  });

  it('collapses a single-value range', () => {
    const after: Prescription = { ...DEFAULT_PRESCRIPTION, repRange: { min: 5, max: 5 } };
    expect(diffPrescriptions(DEFAULT_PRESCRIPTION, after)[0]?.after).toBe('5');
  });

  it('reports RIR, rest and load-hint changes', () => {
    const after: Prescription = {
      ...DEFAULT_PRESCRIPTION,
      rirRange: { min: 0, max: 1 },
      restSeconds: 180,
      loadHint: 'same as last + 5',
    };
    const fields = diffPrescriptions(DEFAULT_PRESCRIPTION, after).map((change) => change.field);
    expect(fields).toEqual(['rir', 'rest', 'loadHint']);
  });

  it('describes a null rest as the default', () => {
    const before: Prescription = { ...DEFAULT_PRESCRIPTION, restSeconds: 120 };
    expect(diffPrescriptions(before, DEFAULT_PRESCRIPTION)).toEqual([
      { field: 'rest', before: '120s', after: 'default' },
    ]);
  });

  it('treats a null and an empty load hint as the same', () => {
    const before: Prescription = { ...DEFAULT_PRESCRIPTION, loadHint: null };
    const after: Prescription = { ...DEFAULT_PRESCRIPTION, loadHint: '' };
    expect(diffPrescriptions(before, after)).toEqual([]);
  });
});

describe('diffPlans', () => {
  it('reports no changes between identical snapshots', () => {
    const diff = diffPlans([PUSH], cloneWorkouts([PUSH]));
    expect(diff.hasChanges).toBe(false);
    expect(diff.changes).toEqual([]);
    expect(diff.summary).toBe('No changes');
  });

  it('produces the summary shape the plan calls for', () => {
    const after = workout('w1', 'PUSH', [
      slot('s1', 'Bench Press', { prescription: withSets(4) }),
      slot('s3', 'Incline DB Press'),
    ]);
    const diff = diffPlans([PUSH], [after]);

    expect(diff.summary).toBe('Added Incline DB Press, removed Cable Fly, Bench Press 3→4 sets');
  });

  it('detects an added exercise', () => {
    const after = workout('w1', 'PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    const changes = diffPlans([PUSH], [after]).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'exercise-added', exerciseName: 'Dip' });
  });

  it('detects a removed exercise', () => {
    const after = workout('w1', 'PUSH', [slot('s1', 'Bench Press', { prescription: withSets(3) })]);
    const changes = diffPlans([PUSH], [after]).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'exercise-removed', exerciseName: 'Cable Fly' });
  });

  it('does not report reordering slots as a change, because slotId is stable', () => {
    const after = workout('w1', 'PUSH', [PUSH.slots[1], PUSH.slots[0]] as PlanExerciseSlot[]);
    expect(diffPlans([PUSH], [after]).hasChanges).toBe(false);
  });

  it('reports a rename rather than a delete and an add, because workoutId is stable', () => {
    const after = workout('w1', 'CHEST + DELTS', PUSH.slots);
    const changes = diffPlans([PUSH], [after]).changes;

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({
      kind: 'workout-renamed',
      workoutId: 'w1',
      before: 'PUSH',
      after: 'CHEST + DELTS',
    });
    expect(diffPlans([PUSH], [after]).summary).toBe('Renamed PUSH to CHEST + DELTS');
  });

  it('detects an added workout', () => {
    const arms = workout('w2', 'ARMS', [slot('s9', 'Curl')]);
    const changes = diffPlans([PUSH], [PUSH, arms]).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'workout-added', workoutName: 'ARMS', slotCount: 1 });
  });

  it('detects a removed workout', () => {
    const arms = workout('w2', 'ARMS', [slot('s9', 'Curl')]);
    const changes = diffPlans([PUSH, arms], [PUSH]).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'workout-removed', workoutName: 'ARMS' });
  });

  it('detects reordered workouts', () => {
    const arms = workout('w2', 'ARMS', [slot('s9', 'Curl')]);
    const changes = diffPlans([PUSH, arms], [arms, PUSH]).changes;
    expect(changes.filter((change) => change.kind === 'workout-reordered')).toHaveLength(1);
  });

  it('does not report reordering when a workout was merely added', () => {
    const arms = workout('w2', 'ARMS', [slot('s9', 'Curl')]);
    const changes = diffPlans([PUSH], [arms, PUSH]).changes;
    expect(changes.filter((change) => change.kind === 'workout-reordered')).toEqual([]);
  });

  it('detects a superset change', () => {
    const after = workout('w1', 'PUSH', [
      { ...PUSH.slots[0], supersetGroup: 'A' } as PlanExerciseSlot,
      { ...PUSH.slots[1], supersetGroup: 'A' } as PlanExerciseSlot,
    ]);
    const changes = diffPlans([PUSH], [after]).changes;
    expect(changes.filter((change) => change.kind === 'superset-changed')).toHaveLength(2);
    expect(diffPlans([PUSH], [after]).summary).toContain('added to a superset');
  });

  it('detects a notes change without leaking the note text into the summary', () => {
    const after = workout('w1', 'PUSH', [
      { ...PUSH.slots[0]!, notes: 'pause at the chest' },
      PUSH.slots[1]!,
    ]);
    const diff = diffPlans([PUSH], [after]);
    expect(diff.changes[0]).toMatchObject({ kind: 'notes-changed', exerciseName: 'Bench Press' });
    expect(diff.summary).toBe('Updated notes on Bench Press');
  });

  it('handles the same exercise twice in one workout independently', () => {
    // The duplicate-exercise case: two slots, same exerciseId, different
    // occurrence indices. Editing one must not report the other as changed.
    const before = workout('w1', 'PUSH', [
      slot('s1', 'Bench Press', { occurrenceIndex: 0, prescription: withSets(4) }),
      slot('s2', 'Bench Press', { occurrenceIndex: 1, prescription: withSets(2) }),
    ]);
    const after = workout('w1', 'PUSH', [
      slot('s1', 'Bench Press', { occurrenceIndex: 0, prescription: withSets(5) }),
      slot('s2', 'Bench Press', { occurrenceIndex: 1, prescription: withSets(2) }),
    ]);

    const changes = diffPlans([before], [after]).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'prescription-changed', slotId: 's1' });
  });

  it('reports several prescription fields on one exercise as one change', () => {
    const after = workout('w1', 'PUSH', [
      slot('s1', 'Bench Press', {
        prescription: { ...withSets(4), repRange: { min: 5, max: 8 } },
      }),
      PUSH.slots[1]!,
    ]);
    const changes = diffPlans([PUSH], [after]).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'prescription-changed' });
    expect(diffPlans([PUSH], [after]).summary).toBe('Bench Press 3→4 sets, 8-12→5-8 reps');
  });

  it('handles an empty before, as when a first version is published', () => {
    const diff = diffPlans([], [PUSH]);
    expect(diff.changes).toHaveLength(1);
    expect(diff.summary).toBe('Added workout PUSH');
  });

  it('handles an empty after', () => {
    expect(diffPlans([PUSH], []).summary).toBe('Removed workout PUSH');
  });

  it('handles both sides empty', () => {
    expect(diffPlans([], []).hasChanges).toBe(false);
  });
});

describe('summarize', () => {
  it('caps a large edit and counts the remainder', () => {
    const after = workout('w1', 'PUSH', [
      slot('s1', 'Bench Press', { prescription: withSets(3) }),
      slot('a', 'One'),
      slot('b', 'Two'),
      slot('c', 'Three'),
      slot('d', 'Four'),
      slot('e', 'Five'),
    ]);
    const summary = diffPlans([PUSH], [after]).summary;

    expect(summary).toContain('2 more changes');
    expect(summary.split(', ')).toHaveLength(5);
  });

  it('uses the singular for exactly one extra change', () => {
    const after = workout('w1', 'PUSH', [
      slot('s1', 'Bench Press', { prescription: withSets(3) }),
      slot('a', 'One'),
      slot('b', 'Two'),
      slot('c', 'Three'),
      slot('d', 'Four'),
    ]);
    expect(diffPlans([PUSH], [after]).summary).toContain('1 more change');
  });

  it('capitalises the first clause only', () => {
    expect(summarize([])).toBe('No changes');
    const after = workout('w1', 'PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    expect(diffPlans([PUSH], [after]).summary).toBe('Added Dip');
  });
});

describe('changesByWorkout', () => {
  it('groups changes for a merge preview', () => {
    const arms = workout('w2', 'ARMS', [slot('s9', 'Curl')]);
    const afterPush = workout('w1', 'PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    const afterArms = workout('w2', 'ARMS', []);

    const grouped = changesByWorkout(diffPlans([PUSH, arms], [afterPush, afterArms]));
    expect(grouped.get('w1')).toHaveLength(1);
    expect(grouped.get('w2')).toHaveLength(1);
  });
});

describe('plansEqual', () => {
  it('is true for a clone and false after any edit', () => {
    expect(plansEqual([PUSH], cloneWorkouts([PUSH]))).toBe(true);
    const after = workout('w1', 'PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    expect(plansEqual([PUSH], [after])).toBe(false);
  });
});

describe('cloneWorkouts', () => {
  it('deep-copies, so a snapshot cannot alias the working copy', () => {
    const clone = cloneWorkouts([PUSH]);
    const cloned = clone[0];
    expect(cloned).toBeDefined();
    if (cloned === undefined) return;

    cloned.name = 'MUTATED';
    cloned.slots[0]!.prescription.sets = 99;
    cloned.slots[0]!.prescription.repRange.min = 99;

    expect(PUSH.name).toBe('PUSH');
    expect(PUSH.slots[0]?.prescription.sets).toBe(3);
    expect(PUSH.slots[0]?.prescription.repRange.min).toBe(8);
  });
});
