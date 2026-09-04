import type { MuscleGroup } from './muscles';

/**
 * Plan types (§2.4) and the pure helpers that maintain their invariants.
 *
 * Two ids in here are load-bearing for history and must never be reassigned:
 *
 * - `workoutId` is stable across plan versions (§2.5). Renaming CHEST to
 *   CHEST + DELTS, reordering it, or swapping its exercises keeps the same id,
 *   which is what preserves that day's overlay history.
 * - `occurrenceIndex` distinguishes the same exercise appearing twice in one
 *   workout. It is part of the overlay key `exerciseId#occurrenceIndex`, so it
 *   is assigned once and never renumbered.
 */

export type RepRange = { min: number; max: number };

export type Prescription = {
  sets: number;
  repRange: RepRange;
  /** Reps in reserve, as a target range. */
  rirRange: RepRange;
  /** null means fall back to the profile default. */
  restSeconds: number | null;
  /** Free text, e.g. "same as last + 5". */
  loadHint: string | null;
};

export type PlanExerciseSlot = {
  /** Stable uuid; survives reordering, and is how planDiff matches slots. */
  slotId: string;
  exerciseId: string;
  /** Denormalised so shared plans and offline sessions render without a lookup. */
  exerciseName: string;
  occurrenceIndex: number;
  prescription: Prescription;
  supersetGroup: string | null;
  notes: string;
};

export type PlanWorkout = {
  /** Stable across plan versions — the overlay depends on this. */
  workoutId: string;
  name: string;
  slots: PlanExerciseSlot[];
};

/** The editable working copy at `plans/{planId}`. */
export type Plan = {
  id: string;
  name: string;
  notes: string;
  currentVersion: number;
  /** workoutIds in display order; authoritative for ordering. */
  workoutOrder: string[];
  workouts: PlanWorkout[];
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** An immutable snapshot at `plans/{planId}/versions/{versionNumber}`. */
export type PlanVersion = {
  versionNumber: number;
  createdAt: string | null;
  changeSummary: string;
  workouts: PlanWorkout[];
};

export const DEFAULT_PRESCRIPTION: Prescription = {
  sets: 3,
  repRange: { min: 8, max: 12 },
  rirRange: { min: 1, max: 3 },
  restSeconds: null,
  loadHint: null,
};

export const MAX_SETS = 20;
export const MAX_REPS = 100;
export const MAX_RIR = 10;

/**
 * Next occurrence index for an exercise in a workout.
 *
 * Deliberately `max + 1` rather than `count`: if occurrence 0 is deleted and
 * occurrence 1 kept, reusing 0 for a later addition would silently inherit the
 * deleted slot's overlay history. Indices are therefore monotonic per exercise
 * per workout, and gaps are expected and harmless.
 */
export function nextOccurrenceIndex(
  slots: readonly PlanExerciseSlot[],
  exerciseId: string,
): number {
  const used = slots
    .filter((slot) => slot.exerciseId === exerciseId)
    .map((slot) => slot.occurrenceIndex);
  return used.length === 0 ? 0 : Math.max(...used) + 1;
}

/** The overlay key for a slot: `exerciseId#occurrenceIndex` (§2.6). */
export function occurrenceKey(exerciseId: string, occurrenceIndex: number): string {
  return `${exerciseId}#${String(occurrenceIndex)}`;
}

export function slotOccurrenceKey(slot: PlanExerciseSlot): string {
  return occurrenceKey(slot.exerciseId, slot.occurrenceIndex);
}

export type NewSlotInput = {
  slotId: string;
  exerciseId: string;
  exerciseName: string;
  prescription?: Prescription;
};

/** Builds a slot with the correct occurrence index for its workout. */
export function createSlot(
  slots: readonly PlanExerciseSlot[],
  input: NewSlotInput,
): PlanExerciseSlot {
  return {
    slotId: input.slotId,
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    occurrenceIndex: nextOccurrenceIndex(slots, input.exerciseId),
    prescription: input.prescription ?? DEFAULT_PRESCRIPTION,
    supersetGroup: null,
    notes: '',
  };
}

/**
 * Workouts in display order. Driven by `workoutOrder`, with any workout the
 * order does not mention appended, so a partially-written order never hides a
 * workout.
 */
export function orderedWorkouts(plan: Plan): PlanWorkout[] {
  const byId = new Map(plan.workouts.map((workout) => [workout.workoutId, workout]));
  const ordered: PlanWorkout[] = [];

  for (const workoutId of plan.workoutOrder) {
    const workout = byId.get(workoutId);
    if (workout !== undefined) {
      ordered.push(workout);
      byId.delete(workoutId);
    }
  }

  return [...ordered, ...byId.values()];
}

/** Moves an item between positions, returning a new array. */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= result.length || to < 0 || to >= result.length || from === to) {
    return result;
  }
  const [moved] = result.splice(from, 1);
  if (moved !== undefined) result.splice(to, 0, moved);
  return result;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Coerces a prescription into a self-consistent, in-range shape. */
export function normalizePrescription(prescription: Prescription): Prescription {
  const sets = clamp(Math.round(prescription.sets), 1, MAX_SETS);
  const repMin = clamp(Math.round(prescription.repRange.min), 1, MAX_REPS);
  const repMax = clamp(Math.round(prescription.repRange.max), repMin, MAX_REPS);
  const rirMin = clamp(Math.round(prescription.rirRange.min), 0, MAX_RIR);
  const rirMax = clamp(Math.round(prescription.rirRange.max), rirMin, MAX_RIR);
  const rest =
    prescription.restSeconds === null ? null : clamp(Math.round(prescription.restSeconds), 0, 3600);
  const hint = prescription.loadHint === null ? null : prescription.loadHint.trim();

  return {
    sets,
    repRange: { min: repMin, max: repMax },
    rirRange: { min: rirMin, max: rirMax },
    restSeconds: rest,
    loadHint: hint === '' ? null : hint,
  };
}

export function formatRange(range: RepRange): string {
  return range.min === range.max ? String(range.min) : `${String(range.min)}-${String(range.max)}`;
}

/** e.g. `4 x 12-20 @ 1-3 RIR` */
export function formatPrescription(prescription: Prescription): string {
  return (
    `${String(prescription.sets)} x ${formatRange(prescription.repRange)}` +
    ` @ ${formatRange(prescription.rirRange)} RIR`
  );
}

/** Total prescribed sets in a workout. */
export function totalSets(workout: PlanWorkout): number {
  return workout.slots.reduce((sum, slot) => sum + slot.prescription.sets, 0);
}

/** Slots grouped into supersets, preserving order; ungrouped slots stand alone. */
export function supersetGroups(workout: PlanWorkout): PlanExerciseSlot[][] {
  const groups: PlanExerciseSlot[][] = [];
  const byGroup = new Map<string, PlanExerciseSlot[]>();

  for (const slot of workout.slots) {
    if (slot.supersetGroup === null) {
      groups.push([slot]);
      continue;
    }
    const existing = byGroup.get(slot.supersetGroup);
    if (existing === undefined) {
      const created = [slot];
      byGroup.set(slot.supersetGroup, created);
      groups.push(created);
    } else {
      existing.push(slot);
    }
  }

  return groups;
}

/** Muscles a workout touches, for a quick label without full volume math. */
export function workoutMuscles(
  workout: PlanWorkout,
  primaryMusclesOf: (exerciseId: string) => readonly MuscleGroup[],
): MuscleGroup[] {
  const seen = new Set<MuscleGroup>();
  for (const slot of workout.slots) {
    for (const muscle of primaryMusclesOf(slot.exerciseId)) seen.add(muscle);
  }
  return [...seen];
}

// --- Parsing untrusted plan documents ------------------------------------
// Kept in the domain so it is testable without Firestore. The data layer only
// converts Timestamps to ISO strings before handing values over.

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asRange(value: unknown, fallback: RepRange): RepRange {
  if (typeof value !== 'object' || value === null) return fallback;
  const record = value as Record<string, unknown>;
  return {
    min: asNumber(record['min'], fallback.min),
    max: asNumber(record['max'], fallback.max),
  };
}

export function parsePrescription(value: unknown): Prescription {
  if (typeof value !== 'object' || value === null) return DEFAULT_PRESCRIPTION;
  const record = value as Record<string, unknown>;
  const rest: unknown = record['restSeconds'];
  const hint: unknown = record['loadHint'];

  return normalizePrescription({
    sets: asNumber(record['sets'], DEFAULT_PRESCRIPTION.sets),
    repRange: asRange(record['repRange'], DEFAULT_PRESCRIPTION.repRange),
    rirRange: asRange(record['rirRange'], DEFAULT_PRESCRIPTION.rirRange),
    restSeconds: typeof rest === 'number' && Number.isFinite(rest) ? rest : null,
    loadHint: typeof hint === 'string' && hint.trim() !== '' ? hint : null,
  });
}

/** Returns null for a slot with no usable identity, so it is dropped. */
export function parseSlot(value: unknown): PlanExerciseSlot | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const slotId = asString(record['slotId']);
  const exerciseId = asString(record['exerciseId']);
  if (slotId === '' || exerciseId === '') return null;

  const superset: unknown = record['supersetGroup'];

  return {
    slotId,
    exerciseId,
    exerciseName: asString(record['exerciseName'], exerciseId),
    occurrenceIndex: Math.max(0, Math.round(asNumber(record['occurrenceIndex'], 0))),
    prescription: parsePrescription(record['prescription']),
    supersetGroup: typeof superset === 'string' && superset !== '' ? superset : null,
    notes: asString(record['notes']),
  };
}

export function parsePlanWorkouts(value: unknown): PlanWorkout[] {
  if (!Array.isArray(value)) return [];

  const workouts: PlanWorkout[] = [];
  for (const raw of value as readonly unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const workoutId = asString(record['workoutId']);
    if (workoutId === '') continue;

    const slots: PlanExerciseSlot[] = [];
    if (Array.isArray(record['slots'])) {
      for (const rawSlot of record['slots'] as readonly unknown[]) {
        const slot = parseSlot(rawSlot);
        if (slot !== null) slots.push(slot);
      }
    }

    workouts.push({ workoutId, name: asString(record['name'], 'Workout'), slots });
  }

  return workouts;
}

export function parseWorkoutOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).filter(
    (item): item is string => typeof item === 'string' && item !== '',
  );
}
