import { describe, expect, it } from 'vitest';
import {
  bodiesEqual,
  cloneBody,
  diffPrescriptions,
  diffWorkout,
  hasUnpublishedChanges,
  summarize,
} from './workoutDiff';
import type { ExerciseSlot, Prescription, WorkoutBody } from './workouts';
import { DEFAULT_PRESCRIPTION, createRestSlot, parseWorkoutBody, pruneGroupRest } from './workouts';

function slot(
  slotId: string,
  exerciseName: string,
  overrides: Partial<ExerciseSlot> = {},
): ExerciseSlot {
  return {
    slotId,
    kind: 'exercise',
    exerciseId: exerciseName.toLowerCase().replace(/\s+/gu, '_'),
    exerciseName,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION },
    supersetGroup: null,
    notes: '',
    ...overrides,
  };
}

function workout(name: string, slots: ExerciseSlot[]): WorkoutBody {
  return { name, slots, groupRest: {} };
}

const withSets = (sets: number): Prescription => ({ ...DEFAULT_PRESCRIPTION, sets });

const PUSH = workout('PUSH', [
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

describe('diffWorkout', () => {
  it('reports no changes between identical snapshots', () => {
    const diff = diffWorkout(PUSH, cloneBody(PUSH));
    expect(diff.hasChanges).toBe(false);
    expect(diff.changes).toEqual([]);
    expect(diff.summary).toBe('No changes');
  });

  it('produces the summary shape the plan calls for', () => {
    const after = workout('PUSH', [
      slot('s1', 'Bench Press', { prescription: withSets(4) }),
      slot('s3', 'Incline DB Press'),
    ]);
    const diff = diffWorkout(PUSH, after);

    expect(diff.summary).toBe('Added Incline DB Press, removed Cable Fly, Bench Press 3→4 sets');
  });

  it('detects an added exercise', () => {
    const after = workout('PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    const changes = diffWorkout(PUSH, after).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'exercise-added', exerciseName: 'Dip' });
  });

  it('detects a removed exercise', () => {
    const after = workout('PUSH', [slot('s1', 'Bench Press', { prescription: withSets(3) })]);
    const changes = diffWorkout(PUSH, after).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'exercise-removed', exerciseName: 'Cable Fly' });
  });

  it('does not report reordering slots as a change, because slotId is stable', () => {
    const after = workout('PUSH', [PUSH.slots[1], PUSH.slots[0]] as ExerciseSlot[]);
    expect(diffWorkout(PUSH, after).hasChanges).toBe(false);
  });

  it('reports a rename rather than a delete and an add, because the id is the document', () => {
    const after = workout('CHEST + DELTS', PUSH.slots);
    const diff = diffWorkout(PUSH, after);

    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toEqual({
      kind: 'renamed',
      before: 'PUSH',
      after: 'CHEST + DELTS',
    });
    expect(diff.summary).toBe('Renamed PUSH to CHEST + DELTS');
  });

  it('detects a superset change', () => {
    const after = workout('PUSH', [
      { ...PUSH.slots[0], supersetGroup: 'A' } as ExerciseSlot,
      { ...PUSH.slots[1], supersetGroup: 'A' } as ExerciseSlot,
    ]);
    const diff = diffWorkout(PUSH, after);
    expect(diff.changes.filter((change) => change.kind === 'superset-changed')).toHaveLength(2);
    expect(diff.summary).toContain('added to a superset');
  });

  it('detects a notes change without leaking the note text into the summary', () => {
    const after = workout('PUSH', [
      { ...PUSH.slots[0]!, notes: 'pause at the chest' },
      PUSH.slots[1]!,
    ]);
    const diff = diffWorkout(PUSH, after);
    expect(diff.changes[0]).toMatchObject({ kind: 'notes-changed', exerciseName: 'Bench Press' });
    expect(diff.summary).toBe('Updated notes on Bench Press');
  });

  it('handles the same exercise twice in one workout independently', () => {
    // The duplicate-exercise case: two slots, same exerciseId, different
    // occurrence indices. Editing one must not report the other as changed.
    const before = workout('PUSH', [
      slot('s1', 'Bench Press', { occurrenceIndex: 0, prescription: withSets(4) }),
      slot('s2', 'Bench Press', { occurrenceIndex: 1, prescription: withSets(2) }),
    ]);
    const after = workout('PUSH', [
      slot('s1', 'Bench Press', { occurrenceIndex: 0, prescription: withSets(5) }),
      slot('s2', 'Bench Press', { occurrenceIndex: 1, prescription: withSets(2) }),
    ]);

    const changes = diffWorkout(before, after).changes;
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'prescription-changed', slotId: 's1' });
  });

  it('reports several prescription fields on one exercise as one change', () => {
    const after = workout('PUSH', [
      slot('s1', 'Bench Press', {
        prescription: { ...withSets(4), repRange: { min: 5, max: 8 } },
      }),
      PUSH.slots[1]!,
    ]);
    const diff = diffWorkout(PUSH, after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({ kind: 'prescription-changed' });
    expect(diff.summary).toBe('Bench Press 3→4 sets, 8-12→5-8 reps');
  });

  it('reports a first publish as one creation, not one clause per exercise', () => {
    const diff = diffWorkout(null, PUSH);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changes).toEqual([{ kind: 'created', name: 'PUSH', exerciseCount: 2 }]);
    expect(diff.summary).toBe('Created PUSH with 2 exercises');
  });

  it('counts only exercises in a first publish, not rest rows', () => {
    const rest = slot('r1', 'Rest', { kind: 'rest' });
    const diff = diffWorkout(null, workout('ABS', [PUSH.slots[0]!, rest]));
    expect(diff.summary).toBe('Created ABS with 1 exercise');
  });

  it('handles an emptied workout', () => {
    expect(diffWorkout(PUSH, workout('PUSH', [])).changes).toHaveLength(2);
  });

  it('handles both sides empty', () => {
    expect(diffWorkout(workout('PUSH', []), workout('PUSH', [])).hasChanges).toBe(false);
  });
});

describe('summarize', () => {
  it('caps a large edit and counts the remainder', () => {
    const after = workout('PUSH', [
      slot('s1', 'Bench Press', { prescription: withSets(3) }),
      slot('a', 'One'),
      slot('b', 'Two'),
      slot('c', 'Three'),
      slot('d', 'Four'),
      slot('e', 'Five'),
    ]);
    const summary = diffWorkout(PUSH, after).summary;

    expect(summary).toContain('2 more changes');
    expect(summary.split(', ')).toHaveLength(5);
  });

  it('uses the singular for exactly one extra change', () => {
    const after = workout('PUSH', [
      slot('s1', 'Bench Press', { prescription: withSets(3) }),
      slot('a', 'One'),
      slot('b', 'Two'),
      slot('c', 'Three'),
      slot('d', 'Four'),
    ]);
    expect(diffWorkout(PUSH, after).summary).toContain('1 more change');
  });

  it('capitalises the first clause only', () => {
    expect(summarize([])).toBe('No changes');
    const after = workout('PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    expect(diffWorkout(PUSH, after).summary).toBe('Added Dip');
  });
});

describe('publish round trip', () => {
  /** A body with every field a snapshot has to survive. */
  const RICH: WorkoutBody = {
    name: 'ABS + BODYWEIGHT',
    slots: [
      slot('s1', 'Bench Jump', { prescription: { ...DEFAULT_PRESCRIPTION, loadHint: null } }),
      slot('s2', 'Pushups', {
        supersetGroup: 'g1',
        notes: '',
        prescription: { ...DEFAULT_PRESCRIPTION, restSeconds: 0, loadHint: 'bodyweight' },
      }),
      slot('s3', 'Crunches', {
        supersetGroup: 'g1',
        prescription: { ...DEFAULT_PRESCRIPTION, restSeconds: 0 },
      }),
      createRestSlot('r1', 90),
    ],
    groupRest: { g1: 45 },
  };

  /** What Firestore gives back: the stored snapshot, narrowed again. */
  function storeAndRead(body: WorkoutBody): WorkoutBody {
    return parseWorkoutBody(JSON.parse(JSON.stringify(cloneBody(body))) as Record<string, unknown>);
  }

  it('sees no change between a published snapshot and the body it came from', () => {
    expect(diffWorkout(storeAndRead(RICH), storeAndRead(RICH)).hasChanges).toBe(false);
  });

  it('sees no change after the working copy is pruned on the next edit', () => {
    // `commit` prunes round rest on every edit, so the stored body can differ
    // from the snapshot in `groupRest` alone. That must not read as a change.
    const edited = storeAndRead(pruneGroupRest(RICH));
    expect(diffWorkout(storeAndRead(RICH), edited).hasChanges).toBe(false);
  });

  it('sees no change when a dissolved group leaves its round rest behind', () => {
    const stale: WorkoutBody = { ...RICH, groupRest: { g1: 45, gone: 120 } };
    expect(diffWorkout(storeAndRead(RICH), storeAndRead(stale)).hasChanges).toBe(false);
  });
});

describe('hasUnpublishedChanges', () => {
  it('is false while the version list has not loaded', () => {
    // The bug this pins: an empty list meant "never published", so an
    // untouched v1 workout offered to publish an identical v2.
    expect(hasUnpublishedChanges(null, 1, PUSH)).toBe(false);
  });

  it('is true for a workout with nothing published yet', () => {
    expect(hasUnpublishedChanges(null, 0, PUSH)).toBe(true);
  });

  it('is false once the snapshot loads and matches', () => {
    expect(hasUnpublishedChanges(cloneBody(PUSH), 1, PUSH)).toBe(false);
  });

  it('is true once the snapshot loads and differs', () => {
    const after = workout('PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    expect(hasUnpublishedChanges(cloneBody(PUSH), 1, after)).toBe(true);
  });
});

describe('bodiesEqual', () => {
  it('is true for a clone and false after any edit', () => {
    expect(bodiesEqual(PUSH, cloneBody(PUSH))).toBe(true);
    const after = workout('PUSH', [...PUSH.slots, slot('s3', 'Dip')]);
    expect(bodiesEqual(PUSH, after)).toBe(false);
  });
});

describe('cloneBody', () => {
  it('deep-copies, so a snapshot cannot alias the working copy', () => {
    const clone = cloneBody(PUSH);

    clone.name = 'MUTATED';
    clone.slots[0]!.prescription.sets = 99;
    clone.slots[0]!.prescription.repRange.min = 99;

    expect(PUSH.name).toBe('PUSH');
    expect(PUSH.slots[0]?.prescription.sets).toBe(3);
    expect(PUSH.slots[0]?.prescription.repRange.min).toBe(8);
  });

  it('keeps only the versioned fields, so a snapshot cannot leak into the document', () => {
    expect(Object.keys(cloneBody(PUSH)).sort()).toEqual(['groupRest', 'name', 'slots']);
  });
});

describe('discarding edits', () => {
  it('reverts the working copy to the last published version', () => {
    const edited = workout('PUSH EXPERIMENT', [...PUSH.slots, slot('s3', 'Dumbbell Flyes')]);
    expect(hasUnpublishedChanges(PUSH, 1, edited)).toBe(true);

    const restored = cloneBody(PUSH);
    expect(hasUnpublishedChanges(PUSH, 1, restored)).toBe(false);
    expect(restored.name).toBe('PUSH');
    expect(restored.slots).toHaveLength(2);
  });

  it('puts a circuit back together again', () => {
    const published: WorkoutBody = {
      name: 'ABS',
      slots: [
        slot('s1', 'Pushups', { supersetGroup: 'g1' }),
        slot('s2', 'Crunches', { supersetGroup: 'g1' }),
      ],
      groupRest: { g1: 45 },
    };
    const brokenUp = pruneGroupRest(
      workout('ABS', [slot('s1', 'Pushups'), slot('s2', 'Crunches')]),
    );

    expect(hasUnpublishedChanges(published, 1, brokenUp)).toBe(true);
    expect(hasUnpublishedChanges(published, 1, cloneBody(published))).toBe(false);
  });
});
