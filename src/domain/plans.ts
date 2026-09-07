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
  /**
   * Rest between rounds of a circuit, keyed by `supersetGroup` id.
   *
   * A circuit has two different rests: the pause *after each exercise* (a
   * slot's own `restSeconds`, normally 0 so the round flows) and the pause
   * *after a whole round*, which is this. It lives on the workout rather than
   * on the last member because reordering the circuit would otherwise move
   * the round rest into the middle of it.
   *
   * A missing entry means fall back to the profile default.
   */
  groupRest: Record<string, number | null>;
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
  // 1-2 RIR: close enough to failure to drive adaptation, with a rep in hand.
  rirRange: { min: 1, max: 2 },
  restSeconds: null,
  loadHint: null,
};

/** Hard caps. Imported and shared plans are clamped to these. */
export const MAX_SETS = 20;
export const MAX_REPS = 100;
export const MAX_RIR = 10;

/**
 * Soft bounds for the range controls. Real programming lives well inside
 * these, and an editor bound to the hard caps would make every useful value a
 * pixel apart. A prescription that arrives above a soft bound (an imported
 * 50-rep set) widens its own control rather than being clamped — see
 * `sliderBound`.
 */
export const REPS_SOFT_MAX = 30;
export const RIR_SOFT_MAX = 5;

/**
 * Smallest span a range control will let you set.
 *
 * A prescription is a target *window*, so a collapsed range says less than it
 * looks like it does. Reps get a wider floor than RIR because two reps of
 * latitude is the useful unit there, whereas RIR only spans 0-5 at all.
 *
 * These constrain the editor, not the data: an imported plan with a fixed
 * target is stored and shown as-is (see `normalizePrescription`, which only
 * enforces max >= min).
 */
export const REPS_MIN_GAP = 2;
export const RIR_MIN_GAP = 1;

/** Upper bound for a range control that must still fit `current`. */
export function sliderBound(softMax: number, current: number): number {
  return Math.max(softMax, Math.ceil(current));
}

/**
 * Rest as a plain seconds count: `120s`.
 *
 * Configuration is expressed in seconds everywhere — the stored value, the
 * presets, and the input all agree — because mixing `2:00` presets with a
 * `120 s` field made the same number look like two different quantities.
 */
export function formatRestSeconds(seconds: number): string {
  return `${String(seconds)}s`;
}

/**
 * A duration as `2:00`, for a *running* clock. The rest timer counts down, so
 * m:ss is right there; it is deliberately not used for configuration.
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes)}:${remainder.toString().padStart(2, '0')}`;
}

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
 * Inserts a slot directly after `afterSlotId`, adopting that slot's circuit
 * when it has one — pressing + on a circuit member adds another member rather
 * than dropping a loose exercise into the middle of the block.
 *
 * Pass null to append at the end, ungrouped.
 */
export function insertSlotAfter(
  slots: readonly PlanExerciseSlot[],
  afterSlotId: string | null,
  slot: PlanExerciseSlot,
): PlanExerciseSlot[] {
  if (afterSlotId === null) return [...slots, slot];

  const position = slots.findIndex((item) => item.slotId === afterSlotId);
  if (position === -1) return [...slots, slot];

  const host = slots[position];
  const groupId = host?.supersetGroup ?? null;

  const joined: PlanExerciseSlot =
    groupId === null
      ? slot
      : {
          ...slot,
          supersetGroup: groupId,
          prescription: {
            ...slot.prescription,
            sets: host?.prescription.sets ?? slot.prescription.sets,
            restSeconds: 0,
          },
        };

  const next = [...slots];
  next.splice(position + 1, 0, joined);
  return next;
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

/** e.g. `4 x 12-20 @ 1-2 RIR` */
export function formatPrescription(prescription: Prescription): string {
  return (
    `${String(prescription.sets)} x ${formatRange(prescription.repRange)}` +
    ` @ ${formatRange(prescription.rirRange)} RIR`
  );
}

/**
 * Rough time model for a set: a fixed cost to set up and unrack, plus time
 * under tension proportional to the rep target.
 *
 * Deliberately crude — the honest precision here is "about 45 minutes", not
 * "44:20" — but it responds to the things that actually move a session's
 * length: how many sets, how many reps, and how long you rest.
 */
export const SET_OVERHEAD_SECONDS = 12;
export const SECONDS_PER_REP = 3;

/** Working time for one set of this prescription, excluding rest. */
export function estimateSetSeconds(prescription: Prescription): number {
  const midReps = (prescription.repRange.min + prescription.repRange.max) / 2;
  return SET_OVERHEAD_SECONDS + midReps * SECONDS_PER_REP;
}

/**
 * Estimated wall-clock seconds for a workout.
 *
 * Circuit members are counted per round, their own rest is the pause inside a
 * round, and the group's rest is added once per round. The very last rest of
 * the workout is dropped: you finish on a set, not on a stopwatch.
 */
export function estimateWorkoutSeconds(workout: PlanWorkout, defaultRestSeconds: number): number {
  let total = 0;
  let trailingRest = 0;

  for (const group of supersetGroups(workout)) {
    const first = group[0];
    if (first === undefined) continue;

    if (first.supersetGroup === null) {
      // A plain exercise: every set, each followed by its rest.
      const rest = first.prescription.restSeconds ?? defaultRestSeconds;
      const sets = first.prescription.sets;
      total += sets * (estimateSetSeconds(first.prescription) + rest);
      trailingRest = rest;
      continue;
    }

    const rounds = groupRounds(group) ?? Math.max(...group.map((s) => s.prescription.sets));
    const roundRest = workout.groupRest[first.supersetGroup] ?? defaultRestSeconds;

    let perRound = 0;
    for (const member of group) {
      // Inside a circuit a member's own rest is the pause before the next
      // exercise, and defaults to none rather than the profile default.
      perRound += estimateSetSeconds(member.prescription) + (member.prescription.restSeconds ?? 0);
    }

    total += rounds * perRound + rounds * roundRest;
    trailingRest = roundRest;
  }

  return Math.max(0, Math.round(total - trailingRest));
}

/** Estimated seconds across a plan — one pass through every workout. */
export function estimatePlanSeconds(
  workouts: readonly PlanWorkout[],
  defaultRestSeconds: number,
): number {
  return workouts.reduce(
    (total, workout) => total + estimateWorkoutSeconds(workout, defaultRestSeconds),
    0,
  );
}

/** A duration as `45 min` or `1 h 20`, for an at-a-glance estimate. */
export function formatEstimate(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${remainder.toString().padStart(2, '0')}`;
}

/** Total prescribed sets in a workout. */
export function totalSets(workout: PlanWorkout): number {
  return workout.slots.reduce((sum, slot) => sum + slot.prescription.sets, 0);
}

/**
 * Rounds a circuit runs for: every member's set count, when they agree.
 *
 * Returns null when members disagree, which only happens for an imported
 * plan — the editor writes the count to every member at once.
 */
export function groupRounds(members: readonly PlanExerciseSlot[]): number | null {
  const first = members[0];
  if (first === undefined) return null;
  const rounds = first.prescription.sets;
  return members.every((slot) => slot.prescription.sets === rounds) ? rounds : null;
}

/** Sets the round count across every member of a group. */
export function withGroupRounds(
  slots: readonly PlanExerciseSlot[],
  groupId: string,
  rounds: number,
): PlanExerciseSlot[] {
  const sets = clamp(Math.round(rounds), 1, MAX_SETS);
  return slots.map((slot) =>
    slot.supersetGroup === groupId
      ? { ...slot, prescription: { ...slot.prescription, sets } }
      : slot,
  );
}

/**
 * Joins a slot into the group of the slot directly above it, starting a new
 * group when that slot has none. Groups are contiguous by construction, which
 * is what lets the logger walk a round in order.
 *
 * The joined slot's own rest drops to 0: inside a circuit you move straight to
 * the next exercise, and the pause belongs to `groupRest` instead.
 */
export function linkToPrevious(
  slots: readonly PlanExerciseSlot[],
  slotId: string,
  newGroupId: string,
): PlanExerciseSlot[] {
  const position = slots.findIndex((slot) => slot.slotId === slotId);
  const previous = position > 0 ? slots[position - 1] : undefined;
  if (previous === undefined) return [...slots];

  const groupId = previous.supersetGroup ?? newGroupId;
  const rounds = previous.prescription.sets;

  return slots.map((slot, index) => {
    if (index === position - 1) {
      return { ...slot, supersetGroup: groupId, prescription: { ...slot.prescription } };
    }
    if (index === position) {
      return {
        ...slot,
        supersetGroup: groupId,
        prescription: { ...slot.prescription, sets: rounds, restSeconds: 0 },
      };
    }
    return slot;
  });
}

/** Detaches a slot from any group, restoring its own rest. */
function detach(slot: PlanExerciseSlot): PlanExerciseSlot {
  return {
    ...slot,
    supersetGroup: null,
    prescription: { ...slot.prescription, restSeconds: null },
  };
}

/**
 * Dissolves any group down to a single member, since a circuit of one is just
 * an exercise. Run after every grouping change.
 */
function dissolveSingletons(slots: readonly PlanExerciseSlot[]): PlanExerciseSlot[] {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    if (slot.supersetGroup !== null) {
      counts.set(slot.supersetGroup, (counts.get(slot.supersetGroup) ?? 0) + 1);
    }
  }
  return slots.map((slot) =>
    slot.supersetGroup !== null && (counts.get(slot.supersetGroup) ?? 0) < 2 ? detach(slot) : slot,
  );
}

/**
 * Groups one slot with another, wherever the two sit in the list.
 *
 * The dragged slot moves to sit directly after the target's group, because
 * circuits are contiguous runs — that is what lets the logger walk a round in
 * order. It adopts the target's round count and drops its own rest to 0, since
 * inside a circuit the pause belongs to `groupRest`.
 *
 * Groups never nest: `supersetGroup` is a single id, so dragging a member of
 * one circuit onto another *moves* it between them rather than building a
 * hierarchy. Any group left with one member dissolves.
 */
export function groupWithSlot(
  slots: readonly PlanExerciseSlot[],
  activeSlotId: string,
  targetSlotId: string,
  newGroupId: string,
): PlanExerciseSlot[] {
  if (activeSlotId === targetSlotId) return [...slots];

  const active = slots.find((slot) => slot.slotId === activeSlotId);
  const target = slots.find((slot) => slot.slotId === targetSlotId);
  if (active === undefined || target === undefined) return [...slots];

  // Already in the same group: nothing to join.
  if (active.supersetGroup !== null && active.supersetGroup === target.supersetGroup) {
    return [...slots];
  }

  const groupId = target.supersetGroup ?? newGroupId;
  const rounds = target.prescription.sets;

  const without = slots.filter((slot) => slot.slotId !== activeSlotId);

  // Insert after the last member of the target's group, so the run stays
  // contiguous whether the target was already a circuit or not.
  let insertAt = without.length;
  for (const [index, slot] of without.entries()) {
    const inTargetGroup =
      slot.slotId === targetSlotId ||
      (slot.supersetGroup !== null && slot.supersetGroup === groupId);
    if (inTargetGroup) insertAt = index + 1;
  }

  const joined: PlanExerciseSlot = {
    ...active,
    supersetGroup: groupId,
    prescription: { ...active.prescription, sets: rounds, restSeconds: 0 },
  };

  const next = without.map((slot) =>
    slot.slotId === targetSlotId ? { ...slot, supersetGroup: groupId } : slot,
  );
  next.splice(insertAt, 0, joined);

  return dissolveSingletons(next);
}

/**
 * Re-establishes the "a circuit is one contiguous run" invariant after a
 * reorder, which is what makes dragging out of a circuit remove you from it.
 *
 * For each group, the longest run of adjacent members wins and anything
 * stranded elsewhere is detached. Dragging a member above or below the block
 * therefore drops it from the circuit, and dropping an outsider into the
 * middle splits the smaller half out rather than leaving one group in two
 * places. Groups down to one member dissolve.
 */
export function reconcileGroups(slots: readonly PlanExerciseSlot[]): PlanExerciseSlot[] {
  // Longest contiguous run per group, earliest run winning a tie.
  const best = new Map<string, { start: number; length: number }>();

  let index = 0;
  while (index < slots.length) {
    const groupId = slots[index]?.supersetGroup ?? null;
    if (groupId === null) {
      index += 1;
      continue;
    }

    let end = index;
    while (end + 1 < slots.length && slots[end + 1]?.supersetGroup === groupId) end += 1;

    const length = end - index + 1;
    const current = best.get(groupId);
    if (current === undefined || length > current.length) {
      best.set(groupId, { start: index, length });
    }
    index = end + 1;
  }

  return dissolveSingletons(
    slots.map((slot, position) => {
      if (slot.supersetGroup === null) return slot;
      const run = best.get(slot.supersetGroup);
      const inside =
        run !== undefined && position >= run.start && position < run.start + run.length;
      return inside ? slot : detach(slot);
    }),
  );
}

/**
 * Removes a slot from its group. A group left with one member is dissolved,
 * since a circuit of one is just an exercise.
 */
export function unlink(slots: readonly PlanExerciseSlot[], slotId: string): PlanExerciseSlot[] {
  const target = slots.find((slot) => slot.slotId === slotId);
  if (target?.supersetGroup === undefined || target.supersetGroup === null) return [...slots];

  return dissolveSingletons(slots.map((slot) => (slot.slotId === slotId ? detach(slot) : slot)));
}

/** Group ids still in use by at least two slots. */
export function activeGroupIds(slots: readonly PlanExerciseSlot[]): string[] {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    if (slot.supersetGroup !== null) {
      counts.set(slot.supersetGroup, (counts.get(slot.supersetGroup) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}

/** Drops round-rest entries for groups that no longer exist. */
export function pruneGroupRest(workout: PlanWorkout): PlanWorkout {
  const live = new Set(activeGroupIds(workout.slots));
  const groupRest: Record<string, number | null> = {};
  for (const [groupId, rest] of Object.entries(workout.groupRest)) {
    if (live.has(groupId)) groupRest[groupId] = rest;
  }
  return { ...workout, groupRest };
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

    workouts.push({
      workoutId,
      name: asString(record['name'], 'Workout'),
      slots,
      groupRest: parseGroupRest(record['groupRest']),
    });
  }

  return workouts;
}

/** Narrows the round-rest map, dropping anything that is not a group id. */
export function parseGroupRest(value: unknown): Record<string, number | null> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const parsed: Record<string, number | null> = {};
  for (const [groupId, rest] of Object.entries(value as Record<string, unknown>)) {
    if (groupId === '') continue;
    if (rest === null) parsed[groupId] = null;
    else if (typeof rest === 'number' && Number.isFinite(rest)) {
      parsed[groupId] = clamp(Math.round(rest), 0, 3600);
    }
  }
  return parsed;
}

export function parseWorkoutOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).filter(
    (item): item is string => typeof item === 'string' && item !== '',
  );
}
