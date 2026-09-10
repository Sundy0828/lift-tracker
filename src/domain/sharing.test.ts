import { describe, expect, it } from 'vitest';
import type { Exercise } from './exercises';
import {
  alignForMerge,
  applyMerge,
  buildSharePayload,
  changeKey,
  customExerciseIds,
  describeNewExercises,
  importAsNewBody,
  parseSharedWorkout,
  planImport,
  previewMerge,
  renumberOccurrences,
  type SharedWorkout,
} from './sharing';
import { diffWorkout } from './workoutDiff';
import type { ExerciseSlot, WorkoutBody } from './workouts';
import { DEFAULT_PRESCRIPTION, MAX_SETS } from './workouts';

/** A slot, with only what a case actually cares about spelled out. */
function slot(over: Partial<ExerciseSlot> & { slotId: string; exerciseId: string }): ExerciseSlot {
  return {
    kind: 'exercise',
    exerciseName: over.exerciseId,
    occurrenceIndex: 0,
    prescription: DEFAULT_PRESCRIPTION,
    supersetGroup: null,
    notes: '',
    ...over,
  };
}

function body(name: string, slots: ExerciseSlot[], groupRest = {}): WorkoutBody {
  return { name, slots, groupRest };
}

function custom(id: string, name: string): Exercise {
  return {
    id,
    name,
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    equipment: null,
    isCustom: true,
    force: null,
    level: null,
    mechanic: null,
    category: null,
  };
}

function share(over: Partial<SharedWorkout> = {}): SharedWorkout {
  return {
    shareId: 'share1',
    ownerUid: 'sender',
    sourceWorkoutId: 'w-sender',
    versionNumber: 1,
    body: body('PUSH', []),
    customExercises: [],
    revoked: false,
    createdAt: null,
    ...over,
  };
}

/** Predictable ids, so a plan can be asserted exactly. */
function minter(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `custom_new${String(next)}`;
  };
}

describe('customExerciseIds', () => {
  it('finds custom references and leaves catalog ones alone', () => {
    const workout = body('PUSH', [
      slot({ slotId: 's1', exerciseId: 'Barbell_Bench_Press' }),
      slot({ slotId: 's2', exerciseId: 'custom_a' }),
      slot({ slotId: 's3', exerciseId: 'custom_b' }),
    ]);
    expect(customExerciseIds(workout)).toEqual(['custom_a', 'custom_b']);
  });

  it('reports each id once, however many slots use it', () => {
    const workout = body('PUSH', [
      slot({ slotId: 's1', exerciseId: 'custom_a', occurrenceIndex: 0 }),
      slot({ slotId: 's2', exerciseId: 'custom_a', occurrenceIndex: 1 }),
    ]);
    expect(customExerciseIds(workout)).toEqual(['custom_a']);
  });
});

describe('buildSharePayload', () => {
  const workout = body('PUSH', [
    slot({ slotId: 's1', exerciseId: 'Barbell_Bench_Press', exerciseName: 'Barbell Bench Press' }),
    slot({ slotId: 's2', exerciseId: 'custom_a', exerciseName: 'Copenhagen Plank' }),
  ]);

  it('inlines custom definitions and references the catalog by id only', () => {
    const payload = buildSharePayload({
      ownerUid: 'sender',
      sourceWorkoutId: 'w1',
      versionNumber: 3,
      body: workout,
      resolve: (id) => (id === 'custom_a' ? custom('custom_a', 'Copenhagen Plank') : null),
    });

    expect(payload.customExercises).toHaveLength(1);
    expect(payload.customExercises[0]).toMatchObject({
      id: 'custom_a',
      name: 'Copenhagen Plank',
      primaryMuscles: ['chest'],
    });
    // The catalog slot travels as a reference; nothing about it is copied.
    expect(payload.customExercises.some((entry) => entry.id === 'Barbell_Bench_Press')).toBe(false);
    expect(payload.versionNumber).toBe(3);
    expect(payload.revoked).toBe(false);
  });

  it('still shares a deleted custom exercise, using the name on the slot', () => {
    // The definition is gone but the workout still lists it, and sharing a
    // shorter workout than the one on screen would be a lie.
    const payload = buildSharePayload({
      ownerUid: 'sender',
      sourceWorkoutId: 'w1',
      versionNumber: 1,
      body: workout,
      resolve: () => null,
    });

    expect(payload.customExercises[0]).toMatchObject({
      id: 'custom_a',
      name: 'Copenhagen Plank',
      primaryMuscles: [],
    });
    expect(payload.slots).toHaveLength(2);
  });

  it('does not alias the workout it was built from', () => {
    const payload = buildSharePayload({
      ownerUid: 'sender',
      sourceWorkoutId: 'w1',
      versionNumber: 1,
      body: workout,
      resolve: () => null,
    });
    expect(payload.slots[0]).not.toBe(workout.slots[0]);
  });
});

describe('parseSharedWorkout', () => {
  it('rejects a document with no owner', () => {
    expect(parseSharedWorkout('s1', {})).toBeNull();
    expect(parseSharedWorkout('s1', undefined)).toBeNull();
  });

  it('treats a missing revoked flag as revoked, not as live', () => {
    // Anyone signed in can create one of these. Absence must fail closed.
    expect(parseSharedWorkout('s1', { ownerUid: 'u' })?.revoked).toBe(true);
    expect(parseSharedWorkout('s1', { ownerUid: 'u', revoked: false })?.revoked).toBe(false);
    expect(parseSharedWorkout('s1', { ownerUid: 'u', revoked: 'no' })?.revoked).toBe(true);
  });

  it('clamps a hostile payload to the app caps instead of trusting it', () => {
    const parsed = parseSharedWorkout('s1', {
      ownerUid: 'u',
      revoked: false,
      name: 'EVIL',
      slots: [
        {
          slotId: 's1',
          exerciseId: 'x',
          prescription: { sets: 9999, repRange: { min: -5, max: 1e9 } },
        },
      ],
    });

    expect(parsed?.body.slots[0]?.prescription.sets).toBeLessThanOrEqual(MAX_SETS);
    expect(parsed?.body.slots[0]?.prescription.repRange.min).toBeGreaterThanOrEqual(0);
  });

  it('drops slots with no usable identity rather than repairing them', () => {
    const parsed = parseSharedWorkout('s1', {
      ownerUid: 'u',
      revoked: false,
      slots: [{ slotId: '', exerciseId: 'x' }, { slotId: 's2', exerciseId: 'y' }, 'nonsense', null],
    });
    expect(parsed?.body.slots.map((entry) => entry.slotId)).toEqual(['s2']);
  });

  it('takes only well-formed inlined exercises, once each', () => {
    const parsed = parseSharedWorkout('s1', {
      ownerUid: 'u',
      revoked: false,
      customExercises: [
        { id: 'custom_a', name: 'Plank', primaryMuscles: ['abdominals', 'nonsense'] },
        { id: 'custom_a', name: 'Duplicate' },
        { id: '', name: 'No id' },
        'nonsense',
      ],
    });

    expect(parsed?.customExercises).toHaveLength(1);
    expect(parsed?.customExercises[0]?.name).toBe('Plank');
    // The bogus muscle is dropped by the shared parser, not passed through.
    expect(parsed?.customExercises[0]?.primaryMuscles).toEqual(['abdominals']);
  });

  it('defaults a missing version to 1 rather than to zero or NaN', () => {
    expect(parseSharedWorkout('s1', { ownerUid: 'u' })?.versionNumber).toBe(1);
    expect(parseSharedWorkout('s1', { ownerUid: 'u', versionNumber: 'x' })?.versionNumber).toBe(1);
    expect(parseSharedWorkout('s1', { ownerUid: 'u', versionNumber: 4 })?.versionNumber).toBe(4);
  });

  it('round-trips a payload it built itself', () => {
    const payload = buildSharePayload({
      ownerUid: 'sender',
      sourceWorkoutId: 'w1',
      versionNumber: 2,
      body: body('PULL', [slot({ slotId: 's1', exerciseId: 'custom_a', exerciseName: 'Row' })]),
      resolve: (id) => custom(id, 'Row'),
    });

    const parsed = parseSharedWorkout('s1', { ...payload });
    expect(parsed?.body.name).toBe('PULL');
    expect(parsed?.body.slots).toHaveLength(1);
    expect(parsed?.customExercises[0]?.name).toBe('Row');
    expect(parsed?.revoked).toBe(false);
  });
});

describe('planImport', () => {
  const shared = share({
    body: body('PUSH', [
      slot({ slotId: 's1', exerciseId: 'Barbell_Bench_Press' }),
      slot({ slotId: 's2', exerciseId: 'custom_sender', exerciseName: 'Copenhagen Plank' }),
    ]),
    customExercises: [
      {
        id: 'custom_sender',
        name: 'Copenhagen Plank',
        primaryMuscles: ['abductors'],
        secondaryMuscles: [],
        equipment: null,
      },
    ],
  });

  it('creates the exercises an importer does not have, and rewires the slots', () => {
    const plan = planImport(shared, [], minter());

    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({ name: 'Copenhagen Plank', newId: 'custom_new1' });
    expect(plan.body.slots[1]?.exerciseId).toBe('custom_new1');
    // The catalog reference is untouched — same id means the same lift.
    expect(plan.body.slots[0]?.exerciseId).toBe('Barbell_Bench_Press');
    expect(describeNewExercises(plan)).toEqual(['Copenhagen Plank']);
  });

  it('reuses one the importer already owns, matching on name', () => {
    const plan = planImport(shared, [custom('custom_mine', 'copenhagen  PLANK ')], minter());

    expect(plan.create).toHaveLength(0);
    expect(plan.body.slots[1]?.exerciseId).toBe('custom_mine');
    expect(plan.reused).toEqual([{ name: 'copenhagen  PLANK ', id: 'custom_mine' }]);
  });

  it('uses the importer name for a reused exercise, not the sender name', () => {
    const plan = planImport(shared, [custom('custom_mine', 'Copenhagen plank')], minter());
    expect(plan.body.slots[1]?.exerciseName).toBe('Copenhagen plank');
  });

  it('never matches a catalog exercise, however alike the name', () => {
    const catalog: Exercise = {
      ...custom('Copenhagen_Plank', 'Copenhagen Plank'),
      isCustom: false,
    };
    const plan = planImport(shared, [catalog], minter());
    // Their catalog entry is not theirs to be reused as a custom definition.
    expect(plan.create).toHaveLength(1);
  });

  it('leaves the share it planned from untouched', () => {
    const before = JSON.stringify(shared);
    planImport(shared, [], minter());
    expect(JSON.stringify(shared)).toBe(before);
  });
});

describe('importAsNewBody', () => {
  it('gives two senders exercises that collapsed onto one distinct occurrences', () => {
    // The sender had "Plank" and "plank" as separate customs. Both map to the
    // importer's single "Plank", and without renumbering both slots would key
    // to `id#0` and read as one lift to the overlay.
    const shared = share({
      body: body('CORE', [
        slot({ slotId: 's1', exerciseId: 'custom_x', exerciseName: 'Plank' }),
        slot({ slotId: 's2', exerciseId: 'custom_y', exerciseName: 'plank' }),
      ]),
      customExercises: [
        {
          id: 'custom_x',
          name: 'Plank',
          primaryMuscles: [],
          secondaryMuscles: [],
          equipment: null,
        },
        {
          id: 'custom_y',
          name: 'plank',
          primaryMuscles: [],
          secondaryMuscles: [],
          equipment: null,
        },
      ],
    });

    const plan = planImport(shared, [custom('custom_mine', 'Plank')], minter());
    const imported = importAsNewBody(plan);

    expect(imported.slots.map((entry) => entry.exerciseId)).toEqual(['custom_mine', 'custom_mine']);
    expect(imported.slots.map((entry) => entry.occurrenceIndex)).toEqual([0, 1]);
  });

  it('drops round rests for circuits that did not come across', () => {
    const shared = share({
      body: body('PUSH', [slot({ slotId: 's1', exerciseId: 'a' })], { ghost: 90 }),
    });
    const imported = importAsNewBody(planImport(shared, [], minter()));
    expect(imported.groupRest).toEqual({});
  });
});

describe('renumberOccurrences', () => {
  it('numbers each exercise from zero in slot order', () => {
    const numbered = renumberOccurrences(
      body('W', [
        slot({ slotId: 's1', exerciseId: 'a', occurrenceIndex: 7 }),
        slot({ slotId: 's2', exerciseId: 'b', occurrenceIndex: 4 }),
        slot({ slotId: 's3', exerciseId: 'a', occurrenceIndex: 9 }),
      ]),
    );
    expect(numbered.slots.map((entry) => entry.occurrenceIndex)).toEqual([0, 0, 1]);
  });
});

describe('alignForMerge', () => {
  const target = body('PUSH', [
    slot({ slotId: 'mine1', exerciseId: 'bench', exerciseName: 'Bench' }),
    slot({ slotId: 'mine2', exerciseId: 'fly', exerciseName: 'Fly' }),
  ]);

  it('rekeys matching slots onto the target ids so a diff reads as a change', () => {
    const incoming = body('PUSH', [
      slot({
        slotId: 'theirs1',
        exerciseId: 'bench',
        exerciseName: 'Bench',
        prescription: { ...DEFAULT_PRESCRIPTION, sets: 5 },
      }),
    ]);

    const aligned = alignForMerge(target, incoming);
    expect(aligned.slots[0]?.slotId).toBe('mine1');

    const { changes } = diffWorkout(target, aligned);
    // Without alignment this would be an add plus a remove, and the preview
    // would be unreadable.
    expect(changes.map((change) => change.kind)).toContain('prescription-changed');
    expect(changes.map((change) => change.kind)).not.toContain('exercise-added');
  });

  it('leaves a slot with no counterpart as an addition', () => {
    const incoming = body('PUSH', [slot({ slotId: 'theirs9', exerciseId: 'dip' })]);
    const aligned = alignForMerge(target, incoming);
    expect(aligned.slots[0]?.slotId).toBe('theirs9');
  });

  it('matches on the occurrence key, not on the exercise alone', () => {
    const twice = body('PUSH', [
      slot({ slotId: 'mine1', exerciseId: 'bench', occurrenceIndex: 0 }),
      slot({ slotId: 'mine2', exerciseId: 'bench', occurrenceIndex: 1 }),
    ]);
    const incoming = body('PUSH', [
      slot({ slotId: 'theirs1', exerciseId: 'bench', occurrenceIndex: 1 }),
    ]);
    // Their second bench is the counterpart of the target's second bench.
    expect(alignForMerge(twice, incoming).slots[0]?.slotId).toBe('mine2');
  });

  it('never lets two incoming slots claim the same target slot', () => {
    const incoming = body('PUSH', [
      slot({ slotId: 'theirs1', exerciseId: 'bench', occurrenceIndex: 0 }),
      slot({ slotId: 'theirs2', exerciseId: 'bench', occurrenceIndex: 0 }),
    ]);
    const aligned = alignForMerge(target, incoming);
    expect(aligned.slots[0]?.slotId).toBe('mine1');
    expect(aligned.slots[1]?.slotId).toBe('theirs2');
  });
});

describe('previewMerge', () => {
  it('does not tick removals by default', () => {
    const target = body('PUSH', [
      slot({ slotId: 'mine1', exerciseId: 'bench' }),
      slot({ slotId: 'mine2', exerciseId: 'fly', exerciseName: 'Fly' }),
    ]);
    const incoming = body('PUSH', [
      slot({ slotId: 't1', exerciseId: 'bench' }),
      slot({ slotId: 't2', exerciseId: 'dip', exerciseName: 'Dip' }),
    ]);

    const preview = previewMerge(target, incoming);
    const kinds = preview.changes.map((change) => change.kind);
    expect(kinds).toContain('exercise-added');
    expect(kinds).toContain('exercise-removed');

    // The addition is on; throwing away their Fly is not something a default
    // should do.
    expect(preview.defaultSelection).toContain('exercise-added:t2');
    expect(preview.defaultSelection).not.toContain('exercise-removed:mine2');
  });

  it('does not tick the rename either', () => {
    // Merging their PUSH into mine must not quietly leave mine called theirs.
    const target = body('MY PUSH', [slot({ slotId: 'mine1', exerciseId: 'bench' })]);
    const incoming = body('THEIR PUSH', [
      slot({ slotId: 't1', exerciseId: 'bench' }),
      slot({ slotId: 't2', exerciseId: 'squat', exerciseName: 'Squat' }),
    ]);

    const preview = previewMerge(target, incoming);
    expect(preview.changes.map((change) => change.kind)).toContain('renamed');
    expect(preview.defaultSelection).not.toContain('renamed');
    // Still offered, so it can be taken on purpose.
    expect(applyMerge(target, preview.aligned, new Set(['renamed'])).name).toBe('THEIR PUSH');
    // And the default merge keeps the importer's name.
    expect(applyMerge(target, preview.aligned, new Set(preview.defaultSelection)).name).toBe(
      'MY PUSH',
    );
  });
});

describe('applyMerge', () => {
  const target = body('PUSH', [
    slot({ slotId: 'mine1', exerciseId: 'bench', exerciseName: 'Bench', notes: 'mine' }),
    slot({ slotId: 'mine2', exerciseId: 'fly', exerciseName: 'Fly' }),
  ]);

  const incoming = body('THEIRS', [
    slot({
      slotId: 't1',
      exerciseId: 'bench',
      exerciseName: 'Bench',
      notes: 'theirs',
      prescription: { ...DEFAULT_PRESCRIPTION, sets: 5 },
    }),
    slot({ slotId: 't2', exerciseId: 'dip', exerciseName: 'Dip' }),
  ]);

  it('changes nothing when nothing is accepted', () => {
    const aligned = alignForMerge(target, incoming);
    const merged = applyMerge(target, aligned, new Set());
    expect(merged).toEqual(target);
  });

  it('takes a prescription without taking the note on the same slot', () => {
    const aligned = alignForMerge(target, incoming);
    const merged = applyMerge(target, aligned, new Set(['prescription-changed:mine1']));

    expect(merged.slots[0]?.prescription.sets).toBe(5);
    expect(merged.slots[0]?.notes).toBe('mine');
  });

  it('appends an accepted addition and keeps the target order', () => {
    const aligned = alignForMerge(target, incoming);
    const merged = applyMerge(target, aligned, new Set(['exercise-added:t2']));

    expect(merged.slots.map((entry) => entry.exerciseId)).toEqual(['bench', 'fly', 'dip']);
  });

  it('drops a slot only when its removal is accepted', () => {
    const aligned = alignForMerge(target, incoming);
    expect(applyMerge(target, aligned, new Set()).slots).toHaveLength(2);

    const merged = applyMerge(target, aligned, new Set(['exercise-removed:mine2']));
    expect(merged.slots.map((entry) => entry.exerciseId)).toEqual(['bench']);
  });

  it('renames only when the rename is accepted', () => {
    const aligned = alignForMerge(target, incoming);
    expect(applyMerge(target, aligned, new Set()).name).toBe('PUSH');
    expect(applyMerge(target, aligned, new Set(['renamed'])).name).toBe('THEIRS');
  });

  it('keeps the target slot ids, so its overlay history still resolves', () => {
    const aligned = alignForMerge(target, incoming);
    const merged = applyMerge(
      target,
      aligned,
      new Set(['prescription-changed:mine1', 'exercise-added:t2']),
    );

    // §2.9: merging keeps the target's identity. The overlay keys on
    // exerciseId#occurrenceIndex, so those must survive untouched.
    expect(merged.slots[0]?.slotId).toBe('mine1');
    expect(merged.slots[0]?.exerciseId).toBe('bench');
    expect(merged.slots[0]?.occurrenceIndex).toBe(0);
  });

  it('mutates neither input', () => {
    const aligned = alignForMerge(target, incoming);
    const before = JSON.stringify([target, aligned]);
    applyMerge(target, aligned, new Set(['exercise-removed:mine2', 'exercise-added:t2']));
    expect(JSON.stringify([target, aligned])).toBe(before);
  });

  it('drops a round rest whose circuit did not survive the merge', () => {
    const grouped = body(
      'PUSH',
      [
        slot({ slotId: 'mine1', exerciseId: 'bench', supersetGroup: 'g1' }),
        slot({ slotId: 'mine2', exerciseId: 'fly', supersetGroup: 'g1' }),
      ],
      { g1: 90 },
    );
    const merged = applyMerge(grouped, grouped, new Set(['exercise-removed:mine2']));

    // One member left, so the circuit dissolves and its round rest goes too.
    expect(merged.slots[0]?.supersetGroup).toBeNull();
    expect(merged.groupRest).toEqual({});
  });

  it('produces a body whose diff against the target is the accepted changes', () => {
    const aligned = alignForMerge(target, incoming);
    const selected = new Set(['prescription-changed:mine1', 'exercise-added:t2']);
    const merged = applyMerge(target, aligned, selected);

    const { changes } = diffWorkout(target, merged);
    expect(new Set(changes.map((change) => changeKey(change)))).toEqual(selected);
  });
});
