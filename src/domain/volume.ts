import type { BaseMuscleGroup, MuscleGroup } from './muscles';
import { baseMuscleOf } from './muscles';
import type { WorkoutBody } from './workouts';

/**
 * Set-equivalent volume per muscle group.
 *
 * A prescribed set counts 1.0 for each **primary** muscle and 0.5 for each
 * **secondary** muscle. Multi-muscle exercises are not split: a set of bench
 * press with primary [chest, front delts] gives 1.0 to each, because the
 * question the muscle map answers is "how much work did this muscle get",
 * not "how do I apportion one set".
 */

/** How much one prescribed set contributes, by role. */
export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

export type VolumeByMuscle = ReadonlyMap<MuscleGroup, number>;
export type VolumeByBaseMuscle = ReadonlyMap<BaseMuscleGroup, number>;

/** What the volume math needs to know about an exercise. */
export type ExerciseMuscles = {
  readonly primaryMuscles: readonly MuscleGroup[];
  readonly secondaryMuscles: readonly MuscleGroup[];
};

/** Resolves a slot's exercise; null when the exercise is unknown. */
export type MuscleLookup = (exerciseId: string) => ExerciseMuscles | null;

function add(into: Map<MuscleGroup, number>, muscle: MuscleGroup, amount: number): void {
  into.set(muscle, (into.get(muscle) ?? 0) + amount);
}

/**
 * Volume for one workout, at the finest muscle granularity available.
 *
 * Every slot contributes independently, so an exercise appearing twice in a
 * workout (two occurrence indices) adds up, and superset grouping changes
 * nothing — supersets alter rest, not work done.
 *
 * Slots whose exercise cannot be resolved contribute nothing rather than
 * throwing: a deleted custom exercise must not break the workout screen.
 */
export function workoutVolume(workout: WorkoutBody, lookup: MuscleLookup): VolumeByMuscle {
  const totals = new Map<MuscleGroup, number>();

  for (const slot of workout.slots) {
    // A rest row is not work. Skipped explicitly rather than relying on its
    // reserved id failing to resolve.
    if (slot.kind === 'rest') continue;

    const exercise = lookup(slot.exerciseId);
    if (exercise === null) continue;

    const sets = slot.prescription.sets;
    if (sets <= 0) continue;

    for (const muscle of new Set(exercise.primaryMuscles)) {
      add(totals, muscle, sets * PRIMARY_WEIGHT);
    }
    // A muscle listed as both primary and secondary counts once, as primary.
    const primary = new Set<MuscleGroup>(exercise.primaryMuscles);
    for (const muscle of new Set(exercise.secondaryMuscles)) {
      if (!primary.has(muscle)) add(totals, muscle, sets * SECONDARY_WEIGHT);
    }
  }

  return totals;
}

/**
 * Rolls fine-grained volume up to the base groups the body diagram paints, so
 * `rear delts` work still shades `shoulders` (see domain/muscles).
 */
export function rollUpToBase(volume: VolumeByMuscle): VolumeByBaseMuscle {
  const totals = new Map<BaseMuscleGroup, number>();
  for (const [muscle, amount] of volume) {
    const base = baseMuscleOf(muscle);
    totals.set(base, (totals.get(base) ?? 0) + amount);
  }
  return totals;
}

/**
 * Volume attributed to the regions a diagram actually draws.
 *
 * A muscle the diagram draws keeps its own volume. A muscle it does not draw
 * contributes to its base group instead, which is always drawn. So `obliques`
 * shades its own region when one exists and falls into `abdominals` when it
 * does not — and it is never counted twice, which is what lets a diagram add
 * finer regions (separate delts, say) without touching this math.
 */
export function heatByRegion(
  volume: VolumeByMuscle,
  drawn: ReadonlySet<MuscleGroup>,
): VolumeByMuscle {
  const totals = new Map<MuscleGroup, number>();
  for (const [muscle, amount] of volume) {
    add(totals, drawn.has(muscle) ? muscle : baseMuscleOf(muscle), amount);
  }
  return totals;
}

export type HeatStop = 0 | 1 | 2 | 3 | 4;

/**
 * Lower bounds for stops 1-4 on the 5-stop scale; stop 0 is "nothing".
 *
 * Absolute rather than relative to the biggest number on screen: a workout
 * that gives every muscle two sets should look uniformly light, not fully
 * trained.
 *
 * `SESSION_STOPS` is what the app renders against, because a workout is one
 * session's worth of work and nothing above it knows your week. The weekly
 * bands follow the usual 10-20 sets per muscle per week guidance and are kept
 * for phase 4, which can band real volume across logged sessions — the only
 * place a weekly number is honest.
 */
export const SESSION_STOPS: readonly [number, number, number, number] = [1, 3, 6, 10];

export const WEEKLY_STOPS: readonly [number, number, number, number] = [1, 6, 11, 20];

export function heatStop(
  setEquivalents: number,
  lowerBounds: readonly [number, number, number, number] = WEEKLY_STOPS,
): HeatStop {
  if (setEquivalents < lowerBounds[0]) return 0;
  if (setEquivalents < lowerBounds[1]) return 1;
  if (setEquivalents < lowerBounds[2]) return 2;
  if (setEquivalents < lowerBounds[3]) return 3;
  return 4;
}

export type MuscleVolumeRow = {
  muscle: MuscleGroup;
  setEquivalents: number;
  stop: HeatStop;
};

/**
 * Volume as sorted rows for the readout table — the accessible, real content
 * behind the decorative diagram. Heaviest first so imbalances read top-down.
 */
export function volumeRows(
  volume: VolumeByMuscle,
  lowerBounds: readonly [number, number, number, number] = WEEKLY_STOPS,
): MuscleVolumeRow[] {
  return [...volume.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([muscle, setEquivalents]) => ({
      muscle,
      setEquivalents,
      stop: heatStop(setEquivalents, lowerBounds),
    }))
    .sort((a, b) => b.setEquivalents - a.setEquivalents || a.muscle.localeCompare(b.muscle, 'en'));
}

/** Formats a set-equivalent count: whole numbers plain, halves with one decimal. */
export function formatSetEquivalents(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Total set-equivalents across every muscle, for a headline number. */
export function totalSetEquivalents(volume: VolumeByMuscle): number {
  let total = 0;
  for (const amount of volume.values()) total += amount;
  return total;
}
