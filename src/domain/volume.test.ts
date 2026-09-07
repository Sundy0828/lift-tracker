import { describe, expect, it } from 'vitest';
import type { MuscleGroup } from './muscles';
import type { PlanExerciseSlot, PlanWorkout, Prescription } from './plans';
import { DEFAULT_PRESCRIPTION } from './plans';
import type { ExerciseMuscles, MuscleLookup } from './volume';
import {
  SESSION_STOPS,
  WEEKLY_STOPS,
  formatSetEquivalents,
  heatByRegion,
  heatStop,
  planVolume,
  rollUpToBase,
  totalSetEquivalents,
  volumeRows,
  workoutVolume,
} from './volume';

const EXERCISES: Record<string, ExerciseMuscles> = {
  bench: { primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'] },
  // Multi-muscle primary, and a fine-grained muscle from the second tier.
  incline: { primaryMuscles: ['upper chest', 'front delts'], secondaryMuscles: ['triceps'] },
  fly: { primaryMuscles: ['chest'], secondaryMuscles: [] },
  row: { primaryMuscles: ['middle back'], secondaryMuscles: ['biceps', 'lats'] },
  facepull: { primaryMuscles: ['rear delts'], secondaryMuscles: ['traps'] },
  // Lists chest as both primary and secondary, which must not double count.
  weird: { primaryMuscles: ['chest'], secondaryMuscles: ['chest', 'triceps'] },
  squat: { primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes', 'hamstrings'] },
};

const lookup: MuscleLookup = (id) => EXERCISES[id] ?? null;

let slotCounter = 0;

function slot(exerciseId: string, sets: number, overrides: Partial<PlanExerciseSlot> = {}) {
  slotCounter += 1;
  const prescription: Prescription = { ...DEFAULT_PRESCRIPTION, sets };
  return {
    slotId: `slot-${String(slotCounter)}`,
    kind: 'exercise',
    exerciseId,
    exerciseName: exerciseId,
    occurrenceIndex: 0,
    prescription,
    supersetGroup: null,
    notes: '',
    ...overrides,
  } satisfies PlanExerciseSlot;
}

function workout(name: string, slots: PlanExerciseSlot[]): PlanWorkout {
  return { workoutId: `w-${name}`, name, slots, groupRest: {} };
}

const get = (volume: ReadonlyMap<MuscleGroup, number>, muscle: MuscleGroup): number =>
  volume.get(muscle) ?? 0;

describe('workoutVolume', () => {
  it('counts a primary muscle 1.0 per set', () => {
    const volume = workoutVolume(workout('PUSH', [slot('fly', 4)]), lookup);
    expect(get(volume, 'chest')).toBe(4);
  });

  it('counts a secondary muscle 0.5 per set', () => {
    const volume = workoutVolume(workout('PUSH', [slot('bench', 4)]), lookup);
    expect(get(volume, 'chest')).toBe(4);
    expect(get(volume, 'shoulders')).toBe(2);
    expect(get(volume, 'triceps')).toBe(2);
  });

  it('gives each primary muscle full credit rather than splitting a set', () => {
    const volume = workoutVolume(workout('PUSH', [slot('incline', 3)]), lookup);
    expect(get(volume, 'upper chest')).toBe(3);
    expect(get(volume, 'front delts')).toBe(3);
    expect(get(volume, 'triceps')).toBe(1.5);
  });

  it('counts a muscle listed as both primary and secondary once, as primary', () => {
    const volume = workoutVolume(workout('PUSH', [slot('weird', 4)]), lookup);
    expect(get(volume, 'chest')).toBe(4);
    expect(get(volume, 'triceps')).toBe(2);
  });

  it('adds up across different exercises hitting the same muscle', () => {
    const volume = workoutVolume(workout('PUSH', [slot('bench', 4), slot('fly', 3)]), lookup);
    expect(get(volume, 'chest')).toBe(7);
  });

  it('adds up when the same exercise appears twice in one workout', () => {
    // The duplicate-exercise case: bench early, then a back-off set later.
    const volume = workoutVolume(
      workout('PUSH', [
        slot('bench', 4, { occurrenceIndex: 0 }),
        slot('bench', 2, { occurrenceIndex: 1 }),
      ]),
      lookup,
    );
    expect(get(volume, 'chest')).toBe(6);
    expect(get(volume, 'triceps')).toBe(3);
  });

  it('is unaffected by superset grouping', () => {
    const plain = workout('PUSH', [slot('bench', 4), slot('fly', 3)]);
    const supersetted = workout('PUSH', [
      slot('bench', 4, { supersetGroup: 'A' }),
      slot('fly', 3, { supersetGroup: 'A' }),
    ]);
    expect(workoutVolume(supersetted, lookup)).toEqual(workoutVolume(plain, lookup));
  });

  it('ignores slots whose exercise cannot be resolved', () => {
    // A deleted custom exercise must not break the plan screen.
    const volume = workoutVolume(workout('PUSH', [slot('fly', 4), slot('gone', 5)]), lookup);
    expect(get(volume, 'chest')).toBe(4);
    expect(volume.size).toBe(1);
  });

  it('ignores slots with no sets', () => {
    expect(workoutVolume(workout('PUSH', [slot('fly', 0)]), lookup).size).toBe(0);
  });

  it('returns an empty map for an empty workout', () => {
    expect(workoutVolume(workout('EMPTY', []), lookup).size).toBe(0);
  });
});

describe('planVolume', () => {
  it('sums a multi-day plan', () => {
    const volume = planVolume(
      [
        workout('PUSH', [slot('bench', 4), slot('incline', 3)]),
        workout('PULL', [slot('row', 4), slot('facepull', 3)]),
        workout('LEGS', [slot('squat', 5)]),
      ],
      lookup,
    );

    expect(get(volume, 'chest')).toBe(4);
    expect(get(volume, 'upper chest')).toBe(3);
    expect(get(volume, 'front delts')).toBe(3);
    // bench secondary 2 + incline secondary 1.5 + row secondary 2 (biceps is separate)
    expect(get(volume, 'triceps')).toBe(3.5);
    expect(get(volume, 'middle back')).toBe(4);
    expect(get(volume, 'rear delts')).toBe(3);
    expect(get(volume, 'quadriceps')).toBe(5);
    expect(get(volume, 'glutes')).toBe(2.5);
  });

  it('counts the same workout listed twice, twice', () => {
    const push = workout('PUSH', [slot('fly', 4)]);
    expect(get(planVolume([push, push], lookup), 'chest')).toBe(8);
  });

  it('returns empty for no workouts', () => {
    expect(planVolume([], lookup).size).toBe(0);
  });
});

describe('rollUpToBase', () => {
  it('folds fine-grained muscles into the group the diagram paints', () => {
    const volume = planVolume([workout('PUSH', [slot('incline', 3), slot('facepull', 4)])], lookup);
    const base = rollUpToBase(volume);

    // upper chest -> chest, front delts + rear delts -> shoulders
    expect(base.get('chest')).toBe(3);
    expect(base.get('shoulders')).toBe(7);
    expect(base.get('upper chest' as never)).toBeUndefined();
  });

  it('adds a base muscle and its children together', () => {
    const volume = planVolume(
      [workout('PUSH', [slot('bench', 4), slot('incline', 2), slot('facepull', 2)])],
      lookup,
    );
    const base = rollUpToBase(volume);

    // bench primary chest 4 + incline upper chest 2
    expect(base.get('chest')).toBe(6);
    // bench secondary shoulders 2 + incline front delts 2 + facepull rear delts 2
    expect(base.get('shoulders')).toBe(6);
  });

  it('preserves the grand total', () => {
    const volume = planVolume(
      [workout('PUSH', [slot('bench', 4), slot('incline', 3), slot('facepull', 2)])],
      lookup,
    );
    expect(totalSetEquivalents(rollUpToBase(volume))).toBe(totalSetEquivalents(volume));
  });
});

describe('heatStop', () => {
  it('maps nothing to stop 0', () => {
    expect(heatStop(0)).toBe(0);
    expect(heatStop(0.4)).toBe(0);
  });

  it('walks the weekly bands', () => {
    expect(heatStop(1)).toBe(1);
    expect(heatStop(5.5)).toBe(1);
    expect(heatStop(6)).toBe(2);
    expect(heatStop(10)).toBe(2);
    expect(heatStop(11)).toBe(3);
    expect(heatStop(19)).toBe(3);
    expect(heatStop(20)).toBe(4);
    expect(heatStop(40)).toBe(4);
  });

  it('uses tighter bands for a single session', () => {
    expect(heatStop(3, SESSION_STOPS)).toBe(2);
    expect(heatStop(3, WEEKLY_STOPS)).toBe(1);
    expect(heatStop(10, SESSION_STOPS)).toBe(4);
  });

  it('keeps the bands ordered and non-overlapping', () => {
    for (const stops of [WEEKLY_STOPS, SESSION_STOPS]) {
      expect(stops[0]).toBeLessThan(stops[1]);
      expect(stops[1]).toBeLessThan(stops[2]);
      expect(stops[2]).toBeLessThan(stops[3]);
    }
  });
});

describe('volumeRows', () => {
  it('sorts heaviest first so imbalances read top-down', () => {
    const volume = planVolume([workout('PUSH', [slot('bench', 6), slot('facepull', 2)])], lookup);
    const rows = volumeRows(volume);
    expect(rows[0]?.muscle).toBe('chest');
    expect(rows[0]?.setEquivalents).toBe(6);
    expect(rows.map((row) => row.setEquivalents)).toEqual(
      [...rows].map((row) => row.setEquivalents).sort((a, b) => b - a),
    );
  });

  it('omits muscles with no volume', () => {
    const rows = volumeRows(planVolume([workout('PUSH', [slot('fly', 3)])], lookup));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.muscle).toBe('chest');
  });

  it('tags each row with its heat stop', () => {
    const volume = planVolume([workout('PUSH', [slot('fly', 20)])], lookup);
    expect(volumeRows(volume)[0]?.stop).toBe(4);
  });

  it('breaks ties by muscle name for a stable order', () => {
    const rows = volumeRows(
      new Map<MuscleGroup, number>([
        ['triceps', 4],
        ['biceps', 4],
      ]),
    );
    expect(rows.map((row) => row.muscle)).toEqual(['biceps', 'triceps']);
  });
});

describe('formatSetEquivalents', () => {
  it('prints whole numbers plainly and halves with one decimal', () => {
    expect(formatSetEquivalents(4)).toBe('4');
    expect(formatSetEquivalents(4.5)).toBe('4.5');
    expect(formatSetEquivalents(0)).toBe('0');
  });
});

describe('heatByRegion', () => {
  const drawnWithoutObliques = new Set<MuscleGroup>(['abdominals', 'shoulders', 'chest']);
  const drawnWithObliques = new Set<MuscleGroup>(['abdominals', 'obliques', 'shoulders', 'chest']);

  const volume = new Map<MuscleGroup, number>([
    ['abdominals', 4],
    ['obliques', 6],
    ['rear delts', 3],
  ]);

  it('folds an undrawn muscle into its parent region', () => {
    const heat = heatByRegion(volume, drawnWithoutObliques);
    expect(heat.get('abdominals')).toBe(10);
    expect(heat.get('obliques')).toBeUndefined();
    expect(heat.get('shoulders')).toBe(3);
  });

  it('gives a drawn muscle its own shading instead', () => {
    const heat = heatByRegion(volume, drawnWithObliques);
    expect(heat.get('abdominals')).toBe(4);
    expect(heat.get('obliques')).toBe(6);
  });

  it('never double counts, whichever regions are drawn', () => {
    for (const drawn of [drawnWithoutObliques, drawnWithObliques]) {
      expect(totalSetEquivalents(heatByRegion(volume, drawn))).toBe(13);
    }
  });

  it('leaves a base muscle alone', () => {
    const heat = heatByRegion(new Map<MuscleGroup, number>([['chest', 5]]), drawnWithObliques);
    expect(heat.get('chest')).toBe(5);
  });
});
