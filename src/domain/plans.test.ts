import { describe, expect, it } from 'vitest';
import type { Plan, PlanExerciseSlot, PlanWorkout, Prescription } from './plans';
import {
  DEFAULT_PRESCRIPTION,
  MAX_REPS,
  MAX_RIR,
  MAX_SETS,
  REPS_MIN_GAP,
  REPS_SOFT_MAX,
  RIR_MIN_GAP,
  RIR_SOFT_MAX,
  createSlot,
  formatPrescription,
  formatRange,
  formatDuration,
  formatRestSeconds,
  nextOccurrenceIndex,
  normalizePrescription,
  occurrenceKey,
  orderedWorkouts,
  parsePlanWorkouts,
  parsePrescription,
  parseSlot,
  parseWorkoutOrder,
  reorder,
  sliderBound,
  slotOccurrenceKey,
  supersetGroups,
  totalSets,
  workoutMuscles,
} from './plans';

function slot(overrides: Partial<PlanExerciseSlot> = {}): PlanExerciseSlot {
  return {
    slotId: 's1',
    exerciseId: 'bench',
    exerciseName: 'Bench Press',
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION },
    supersetGroup: null,
    notes: '',
    ...overrides,
  };
}

function workout(workoutId: string, slots: PlanExerciseSlot[] = []): PlanWorkout {
  return { workoutId, name: workoutId.toUpperCase(), slots, groupRest: {} };
}

function plan(workouts: PlanWorkout[], workoutOrder: string[]): Plan {
  return {
    id: 'p1',
    name: 'Plan',
    notes: '',
    currentVersion: 0,
    workoutOrder,
    workouts,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

describe('DEFAULT_PRESCRIPTION', () => {
  it('defaults RIR to 1-2', () => {
    expect(DEFAULT_PRESCRIPTION.rirRange).toEqual({ min: 1, max: 2 });
  });

  it('is self-consistent', () => {
    expect(normalizePrescription(DEFAULT_PRESCRIPTION)).toEqual(DEFAULT_PRESCRIPTION);
  });
});

describe('nextOccurrenceIndex', () => {
  it('starts at 0 for an exercise not yet in the workout', () => {
    expect(nextOccurrenceIndex([], 'bench')).toBe(0);
    expect(nextOccurrenceIndex([slot({ exerciseId: 'squat' })], 'bench')).toBe(0);
  });

  it('increments for a repeat of the same exercise', () => {
    const slots = [slot({ slotId: 'a', occurrenceIndex: 0 })];
    expect(nextOccurrenceIndex(slots, 'bench')).toBe(1);
  });

  it('uses max + 1, not the count, so a deleted index is never reused', () => {
    // Occurrence 0 was deleted and 1 kept. Reusing 0 would silently inherit
    // the deleted slot's overlay history, so the next index must be 2.
    const slots = [slot({ slotId: 'b', occurrenceIndex: 1 })];
    expect(nextOccurrenceIndex(slots, 'bench')).toBe(2);
  });

  it('is unaffected by other exercises reaching higher indices', () => {
    const slots = [
      slot({ slotId: 'a', exerciseId: 'squat', occurrenceIndex: 7 }),
      slot({ slotId: 'b', exerciseId: 'bench', occurrenceIndex: 0 }),
    ];
    expect(nextOccurrenceIndex(slots, 'bench')).toBe(1);
    expect(nextOccurrenceIndex(slots, 'squat')).toBe(8);
  });
});

describe('occurrenceKey', () => {
  it('builds the overlay key used by workoutStats', () => {
    expect(occurrenceKey('bench', 0)).toBe('bench#0');
    expect(occurrenceKey('bench', 2)).toBe('bench#2');
  });

  it('agrees with the slot helper', () => {
    const target = slot({ exerciseId: 'row', occurrenceIndex: 1 });
    expect(slotOccurrenceKey(target)).toBe(occurrenceKey('row', 1));
  });
});

describe('createSlot', () => {
  it('assigns the next occurrence index for its workout', () => {
    const existing = [slot({ slotId: 'a', occurrenceIndex: 0 })];
    const created = createSlot(existing, {
      slotId: 'b',
      exerciseId: 'bench',
      exerciseName: 'Bench Press',
    });
    expect(created.occurrenceIndex).toBe(1);
  });

  it('starts from the default prescription and no superset', () => {
    const created = createSlot([], { slotId: 'a', exerciseId: 'x', exerciseName: 'X' });
    expect(created.prescription).toEqual(DEFAULT_PRESCRIPTION);
    expect(created.supersetGroup).toBeNull();
    expect(created.notes).toBe('');
  });

  it('accepts an explicit prescription', () => {
    const prescription: Prescription = { ...DEFAULT_PRESCRIPTION, sets: 5 };
    const created = createSlot([], {
      slotId: 'a',
      exerciseId: 'x',
      exerciseName: 'X',
      prescription,
    });
    expect(created.prescription.sets).toBe(5);
  });
});

describe('orderedWorkouts', () => {
  it('follows workoutOrder', () => {
    const target = plan([workout('a'), workout('b'), workout('c')], ['c', 'a', 'b']);
    expect(orderedWorkouts(target).map((item) => item.workoutId)).toEqual(['c', 'a', 'b']);
  });

  it('appends workouts the order does not mention, so none can hide', () => {
    const target = plan([workout('a'), workout('b')], ['b']);
    expect(orderedWorkouts(target).map((item) => item.workoutId)).toEqual(['b', 'a']);
  });

  it('ignores ids in the order that no longer exist', () => {
    const target = plan([workout('a')], ['gone', 'a']);
    expect(orderedWorkouts(target).map((item) => item.workoutId)).toEqual(['a']);
  });

  it('handles an empty plan', () => {
    expect(orderedWorkouts(plan([], []))).toEqual([]);
  });
});

describe('reorder', () => {
  it('moves an item forwards and backwards', () => {
    expect(reorder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('returns a copy, leaving the input alone', () => {
    const input = ['a', 'b'];
    const result = reorder(input, 0, 1);
    expect(input).toEqual(['a', 'b']);
    expect(result).not.toBe(input);
  });

  it('is a no-op for out-of-range or identical positions', () => {
    for (const [from, to] of [
      [0, 0],
      [-1, 1],
      [0, 9],
      [9, 0],
    ]) {
      expect(reorder(['a', 'b', 'c'], from ?? 0, to ?? 0)).toEqual(['a', 'b', 'c']);
    }
  });
});

describe('normalizePrescription', () => {
  it('raises a max below its min rather than storing an inverted range', () => {
    const result = normalizePrescription({
      ...DEFAULT_PRESCRIPTION,
      repRange: { min: 12, max: 5 },
      rirRange: { min: 3, max: 1 },
    });
    expect(result.repRange).toEqual({ min: 12, max: 12 });
    expect(result.rirRange).toEqual({ min: 3, max: 3 });
  });

  it('clamps to the hard caps', () => {
    const result = normalizePrescription({
      sets: 999,
      repRange: { min: 0, max: 9999 },
      rirRange: { min: -5, max: 99 },
      restSeconds: 99999,
      loadHint: null,
    });
    expect(result.sets).toBe(MAX_SETS);
    expect(result.repRange).toEqual({ min: 1, max: MAX_REPS });
    expect(result.rirRange).toEqual({ min: 0, max: MAX_RIR });
    expect(result.restSeconds).toBe(3600);
  });

  it('rounds fractional input', () => {
    const result = normalizePrescription({
      ...DEFAULT_PRESCRIPTION,
      sets: 3.6,
      repRange: { min: 8.2, max: 12.7 },
    });
    expect(result.sets).toBe(4);
    expect(result.repRange).toEqual({ min: 8, max: 13 });
  });

  it('keeps a null rest as null', () => {
    expect(normalizePrescription({ ...DEFAULT_PRESCRIPTION, restSeconds: null }).restSeconds).toBe(
      null,
    );
  });

  it('trims a load hint and treats blank as none', () => {
    expect(
      normalizePrescription({ ...DEFAULT_PRESCRIPTION, loadHint: '  same as last  ' }).loadHint,
    ).toBe('same as last');
    expect(normalizePrescription({ ...DEFAULT_PRESCRIPTION, loadHint: '   ' }).loadHint).toBeNull();
  });
});

describe('range minimum gaps', () => {
  it('gives reps a wider floor than RIR', () => {
    expect(REPS_MIN_GAP).toBe(2);
    expect(RIR_MIN_GAP).toBe(1);
  });

  it('leaves the default prescription comfortably inside both', () => {
    const { repRange, rirRange } = DEFAULT_PRESCRIPTION;
    expect(repRange.max - repRange.min).toBeGreaterThanOrEqual(REPS_MIN_GAP);
    expect(rirRange.max - rirRange.min).toBeGreaterThanOrEqual(RIR_MIN_GAP);
  });

  it('is an editor constraint, not a data invariant', () => {
    // An imported plan with a fixed target is stored as-is rather than
    // silently widened.
    const fixed = normalizePrescription({
      ...DEFAULT_PRESCRIPTION,
      repRange: { min: 5, max: 5 },
      rirRange: { min: 2, max: 2 },
    });
    expect(fixed.repRange).toEqual({ min: 5, max: 5 });
    expect(fixed.rirRange).toEqual({ min: 2, max: 2 });
  });
});

describe('sliderBound', () => {
  it('uses the soft maximum normally', () => {
    expect(sliderBound(REPS_SOFT_MAX, 12)).toBe(REPS_SOFT_MAX);
    expect(sliderBound(RIR_SOFT_MAX, 2)).toBe(RIR_SOFT_MAX);
  });

  it('widens to fit a value above the soft maximum', () => {
    // An imported 50-rep prescription must stay editable, not be clamped.
    expect(sliderBound(REPS_SOFT_MAX, 50)).toBe(50);
    expect(sliderBound(RIR_SOFT_MAX, 8)).toBe(8);
  });

  it('rounds a fractional value up so the value is always reachable', () => {
    expect(sliderBound(REPS_SOFT_MAX, 40.2)).toBe(41);
  });
});

describe('formatRange / formatPrescription', () => {
  it('collapses a single-value range', () => {
    expect(formatRange({ min: 5, max: 5 })).toBe('5');
    expect(formatRange({ min: 8, max: 12 })).toBe('8-12');
  });

  it('renders a full prescription', () => {
    expect(formatPrescription(DEFAULT_PRESCRIPTION)).toBe('3 x 8-12 @ 1-2 RIR');
  });
});

describe('formatRestSeconds', () => {
  it('always reads in seconds, so configuration uses one unit throughout', () => {
    // Presets, the stored value and the input all agree; mixing `2:00` labels
    // with a `120s` field made one number look like two quantities.
    expect(formatRestSeconds(0)).toBe('0s');
    expect(formatRestSeconds(45)).toBe('45s');
    expect(formatRestSeconds(120)).toBe('120s');
    expect(formatRestSeconds(240)).toBe('240s');
  });
});

describe('formatDuration', () => {
  it('renders m:ss for a running clock', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(120)).toBe('2:00');
    expect(formatDuration(185)).toBe('3:05');
  });
});

describe('totalSets', () => {
  it('sums prescribed sets across slots', () => {
    const target = workout('w', [
      slot({ slotId: 'a', prescription: { ...DEFAULT_PRESCRIPTION, sets: 4 } }),
      slot({ slotId: 'b', prescription: { ...DEFAULT_PRESCRIPTION, sets: 3 } }),
    ]);
    expect(totalSets(target)).toBe(7);
  });

  it('is zero for an empty workout', () => {
    expect(totalSets(workout('w'))).toBe(0);
  });
});

describe('supersetGroups', () => {
  it('keeps ungrouped slots standing alone, in order', () => {
    const target = workout('w', [slot({ slotId: 'a' }), slot({ slotId: 'b' })]);
    expect(supersetGroups(target).map((group) => group.map((item) => item.slotId))).toEqual([
      ['a'],
      ['b'],
    ]);
  });

  it('collects a superset into one group at its first position', () => {
    const target = workout('w', [
      slot({ slotId: 'a', supersetGroup: 'g1' }),
      slot({ slotId: 'b' }),
      slot({ slotId: 'c', supersetGroup: 'g1' }),
    ]);
    expect(supersetGroups(target).map((group) => group.map((item) => item.slotId))).toEqual([
      ['a', 'c'],
      ['b'],
    ]);
  });

  it('keeps separate superset groups apart', () => {
    const target = workout('w', [
      slot({ slotId: 'a', supersetGroup: 'g1' }),
      slot({ slotId: 'b', supersetGroup: 'g2' }),
    ]);
    expect(supersetGroups(target)).toHaveLength(2);
  });
});

describe('workoutMuscles', () => {
  it('collects primary muscles without duplicates', () => {
    const target = workout('w', [
      slot({ slotId: 'a', exerciseId: 'bench' }),
      slot({ slotId: 'b', exerciseId: 'fly' }),
    ]);
    const muscles = workoutMuscles(target, (id) =>
      id === 'bench' ? ['chest', 'triceps'] : ['chest'],
    );
    expect([...muscles].sort()).toEqual(['chest', 'triceps']);
  });
});

describe('parsePrescription', () => {
  it('falls back to the default for a non-object', () => {
    for (const value of [null, undefined, 7, 'x']) {
      expect(parsePrescription(value)).toEqual(DEFAULT_PRESCRIPTION);
    }
  });

  it('normalises a partial record', () => {
    expect(parsePrescription({ sets: 5 })).toEqual({
      ...DEFAULT_PRESCRIPTION,
      sets: 5,
    });
  });

  it('repairs an inverted stored range', () => {
    const result = parsePrescription({ repRange: { min: 12, max: 4 } });
    expect(result.repRange.max).toBeGreaterThanOrEqual(result.repRange.min);
  });

  it('treats a blank load hint as none', () => {
    expect(parsePrescription({ loadHint: '  ' }).loadHint).toBeNull();
  });
});

describe('parseSlot', () => {
  it('rejects a slot with no usable identity', () => {
    expect(parseSlot(null)).toBeNull();
    expect(parseSlot({})).toBeNull();
    expect(parseSlot({ slotId: 'a' })).toBeNull();
    expect(parseSlot({ exerciseId: 'b' })).toBeNull();
  });

  it('falls back to the exercise id when the name is missing', () => {
    expect(parseSlot({ slotId: 'a', exerciseId: 'bench' })?.exerciseName).toBe('bench');
  });

  it('keeps a negative or fractional occurrence index usable', () => {
    expect(parseSlot({ slotId: 'a', exerciseId: 'b', occurrenceIndex: -3 })?.occurrenceIndex).toBe(
      0,
    );
    expect(parseSlot({ slotId: 'a', exerciseId: 'b', occurrenceIndex: 1.6 })?.occurrenceIndex).toBe(
      2,
    );
  });

  it('treats a blank superset group as none', () => {
    expect(
      parseSlot({ slotId: 'a', exerciseId: 'b', supersetGroup: '' })?.supersetGroup,
    ).toBeNull();
  });
});

describe('parsePlanWorkouts', () => {
  it('returns empty for a non-array', () => {
    for (const value of [null, undefined, {}, 'x']) {
      expect(parsePlanWorkouts(value)).toEqual([]);
    }
  });

  it('drops workouts with no id and slots with no identity', () => {
    const result = parsePlanWorkouts([
      { name: 'no id' },
      {
        workoutId: 'w1',
        name: 'PUSH',
        slots: [{ slotId: 'a', exerciseId: 'bench' }, { junk: true }, null],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.workoutId).toBe('w1');
    expect(result[0]?.slots).toHaveLength(1);
  });

  it('defaults a missing workout name', () => {
    expect(parsePlanWorkouts([{ workoutId: 'w1' }])[0]?.name).toBe('Workout');
  });
});

describe('parseWorkoutOrder', () => {
  it('keeps only non-empty strings', () => {
    expect(parseWorkoutOrder(['a', '', 3, null, 'b'])).toEqual(['a', 'b']);
  });

  it('returns empty for a non-array', () => {
    expect(parseWorkoutOrder({})).toEqual([]);
  });
});
