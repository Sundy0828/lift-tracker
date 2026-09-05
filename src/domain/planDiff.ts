import type { PlanExerciseSlot, PlanWorkout, Prescription } from './plans';
import { formatRange } from './plans';

/**
 * Compares two plan snapshots and produces both a structured diff and a
 * readable one-line summary (§2.5), e.g.
 * *"Added Incline DB Press, removed Cable Fly, Bench Press 3→4 sets."*
 *
 * Matching rules mirror the id guarantees in domain/plans:
 *
 * - workouts match on `workoutId`, which is stable across versions, so a
 *   rename reads as a rename rather than a delete plus an add
 * - slots match on `slotId`, so reordering is not mistaken for churn
 *
 * The same function serves two callers: generating a version's changeSummary
 * on publish, and previewing a plan merge on import (§2.9).
 */

export type PrescriptionField = 'sets' | 'reps' | 'rir' | 'rest' | 'loadHint';

export type PrescriptionChange = {
  field: PrescriptionField;
  before: string;
  after: string;
};

export type PlanChange =
  | { kind: 'workout-added'; workoutId: string; workoutName: string; slotCount: number }
  | { kind: 'workout-removed'; workoutId: string; workoutName: string }
  | { kind: 'workout-renamed'; workoutId: string; before: string; after: string }
  | { kind: 'workout-reordered'; workoutId: string; workoutName: string }
  | {
      kind: 'exercise-added';
      workoutId: string;
      workoutName: string;
      exerciseName: string;
      slotId: string;
    }
  | {
      kind: 'exercise-removed';
      workoutId: string;
      workoutName: string;
      exerciseName: string;
      slotId: string;
    }
  | {
      kind: 'prescription-changed';
      workoutId: string;
      workoutName: string;
      exerciseName: string;
      slotId: string;
      fields: PrescriptionChange[];
    }
  | {
      kind: 'superset-changed';
      workoutId: string;
      workoutName: string;
      exerciseName: string;
      slotId: string;
      before: string | null;
      after: string | null;
    }
  | {
      kind: 'notes-changed';
      workoutId: string;
      workoutName: string;
      exerciseName: string;
      slotId: string;
    };

export type PlanDiff = {
  changes: PlanChange[];
  /** One line, suitable for a version-history row. */
  summary: string;
  hasChanges: boolean;
};

/** How many changes the summary names before collapsing the rest to a count. */
const SUMMARY_LIMIT = 4;

export function diffPrescriptions(before: Prescription, after: Prescription): PrescriptionChange[] {
  const changes: PrescriptionChange[] = [];

  if (before.sets !== after.sets) {
    changes.push({ field: 'sets', before: String(before.sets), after: String(after.sets) });
  }

  const beforeReps = formatRange(before.repRange);
  const afterReps = formatRange(after.repRange);
  if (beforeReps !== afterReps) {
    changes.push({ field: 'reps', before: beforeReps, after: afterReps });
  }

  const beforeRir = formatRange(before.rirRange);
  const afterRir = formatRange(after.rirRange);
  if (beforeRir !== afterRir) {
    changes.push({ field: 'rir', before: beforeRir, after: afterRir });
  }

  if (before.restSeconds !== after.restSeconds) {
    changes.push({
      field: 'rest',
      before: formatRest(before.restSeconds),
      after: formatRest(after.restSeconds),
    });
  }

  if ((before.loadHint ?? '') !== (after.loadHint ?? '')) {
    changes.push({
      field: 'loadHint',
      before: before.loadHint ?? 'none',
      after: after.loadHint ?? 'none',
    });
  }

  return changes;
}

function formatRest(seconds: number | null): string {
  return seconds === null ? 'default' : `${String(seconds)}s`;
}

function indexById<T, K extends string>(items: readonly T[], key: (item: T) => K): Map<K, T> {
  return new Map(items.map((item) => [key(item), item]));
}

export function diffPlans(before: readonly PlanWorkout[], after: readonly PlanWorkout[]): PlanDiff {
  const changes: PlanChange[] = [];

  const beforeWorkouts = indexById(before, (workout) => workout.workoutId);
  const afterWorkouts = indexById(after, (workout) => workout.workoutId);

  for (const workout of after) {
    if (!beforeWorkouts.has(workout.workoutId)) {
      changes.push({
        kind: 'workout-added',
        workoutId: workout.workoutId,
        workoutName: workout.name,
        slotCount: workout.slots.length,
      });
    }
  }

  for (const workout of before) {
    if (!afterWorkouts.has(workout.workoutId)) {
      changes.push({
        kind: 'workout-removed',
        workoutId: workout.workoutId,
        workoutName: workout.name,
      });
    }
  }

  // Order comparison covers only workouts present on both sides, so an add or
  // remove does not also report every later workout as reordered.
  const commonBefore = before
    .filter((workout) => afterWorkouts.has(workout.workoutId))
    .map((workout) => workout.workoutId);
  const commonAfter = after
    .filter((workout) => beforeWorkouts.has(workout.workoutId))
    .map((workout) => workout.workoutId);

  for (const [position, workoutId] of commonAfter.entries()) {
    if (commonBefore[position] !== workoutId) {
      const workout = afterWorkouts.get(workoutId);
      if (workout !== undefined) {
        changes.push({
          kind: 'workout-reordered',
          workoutId,
          workoutName: workout.name,
        });
      }
      break;
    }
  }

  for (const afterWorkout of after) {
    const beforeWorkout = beforeWorkouts.get(afterWorkout.workoutId);
    if (beforeWorkout === undefined) continue;

    if (beforeWorkout.name !== afterWorkout.name) {
      changes.push({
        kind: 'workout-renamed',
        workoutId: afterWorkout.workoutId,
        before: beforeWorkout.name,
        after: afterWorkout.name,
      });
    }

    changes.push(...diffSlots(beforeWorkout, afterWorkout));
  }

  return {
    changes,
    summary: summarize(changes),
    hasChanges: changes.length > 0,
  };
}

function diffSlots(before: PlanWorkout, after: PlanWorkout): PlanChange[] {
  const changes: PlanChange[] = [];
  const beforeSlots = indexById(before.slots, (slot) => slot.slotId);
  const afterSlots = indexById(after.slots, (slot) => slot.slotId);
  const context = { workoutId: after.workoutId, workoutName: after.name };

  for (const slot of after.slots) {
    if (!beforeSlots.has(slot.slotId)) {
      changes.push({
        kind: 'exercise-added',
        ...context,
        exerciseName: slot.exerciseName,
        slotId: slot.slotId,
      });
    }
  }

  for (const slot of before.slots) {
    if (!afterSlots.has(slot.slotId)) {
      changes.push({
        kind: 'exercise-removed',
        ...context,
        exerciseName: slot.exerciseName,
        slotId: slot.slotId,
      });
    }
  }

  for (const afterSlot of after.slots) {
    const beforeSlot = beforeSlots.get(afterSlot.slotId);
    if (beforeSlot === undefined) continue;

    const fields = diffPrescriptions(beforeSlot.prescription, afterSlot.prescription);
    if (fields.length > 0) {
      changes.push({
        kind: 'prescription-changed',
        ...context,
        exerciseName: afterSlot.exerciseName,
        slotId: afterSlot.slotId,
        fields,
      });
    }

    if (beforeSlot.supersetGroup !== afterSlot.supersetGroup) {
      changes.push({
        kind: 'superset-changed',
        ...context,
        exerciseName: afterSlot.exerciseName,
        slotId: afterSlot.slotId,
        before: beforeSlot.supersetGroup,
        after: afterSlot.supersetGroup,
      });
    }

    if (beforeSlot.notes !== afterSlot.notes) {
      changes.push({
        kind: 'notes-changed',
        ...context,
        exerciseName: afterSlot.exerciseName,
        slotId: afterSlot.slotId,
      });
    }
  }

  return changes;
}

const FIELD_NOUNS: Record<PrescriptionField, string> = {
  sets: 'sets',
  reps: 'reps',
  rir: 'RIR',
  rest: 'rest',
  loadHint: 'load note',
};

/** One human-readable clause per change. */
export function describeChange(change: PlanChange): string {
  switch (change.kind) {
    case 'workout-added':
      return `added workout ${change.workoutName}`;
    case 'workout-removed':
      return `removed workout ${change.workoutName}`;
    case 'workout-renamed':
      return `renamed ${change.before} to ${change.after}`;
    case 'workout-reordered':
      return 'reordered workouts';
    case 'exercise-added':
      return `added ${change.exerciseName}`;
    case 'exercise-removed':
      return `removed ${change.exerciseName}`;
    case 'prescription-changed': {
      const parts = change.fields.map(
        (field) => `${field.before}→${field.after} ${FIELD_NOUNS[field.field]}`,
      );
      return `${change.exerciseName} ${parts.join(', ')}`;
    }
    case 'superset-changed':
      return change.after === null
        ? `${change.exerciseName} removed from superset`
        : `${change.exerciseName} added to a superset`;
    case 'notes-changed':
      return `updated notes on ${change.exerciseName}`;
  }
}

/**
 * Joins change clauses into a version-history line, capitalised and capped so
 * a large edit does not produce an unreadable paragraph.
 */
export function summarize(changes: readonly PlanChange[]): string {
  if (changes.length === 0) return 'No changes';

  const clauses = changes.slice(0, SUMMARY_LIMIT).map(describeChange);
  const remaining = changes.length - clauses.length;
  if (remaining > 0) {
    clauses.push(remaining === 1 ? '1 more change' : `${String(remaining)} more changes`);
  }

  const joined = clauses.join(', ');
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

/** Change count grouped by workout, for a merge-preview UI (§2.9). */
export function changesByWorkout(diff: PlanDiff): Map<string, PlanChange[]> {
  const grouped = new Map<string, PlanChange[]>();
  for (const change of diff.changes) {
    const existing = grouped.get(change.workoutId);
    if (existing === undefined) grouped.set(change.workoutId, [change]);
    else existing.push(change);
  }
  return grouped;
}

/** True when two snapshots are equivalent — used to skip pointless versions. */
export function plansEqual(a: readonly PlanWorkout[], b: readonly PlanWorkout[]): boolean {
  return !diffPlans(a, b).hasChanges;
}

/** Deep-copies workouts so a snapshot cannot alias the editable working copy. */
export function cloneWorkouts(workouts: readonly PlanWorkout[]): PlanWorkout[] {
  return workouts.map((workout) => ({
    ...workout,
    groupRest: { ...workout.groupRest },
    slots: workout.slots.map((slot: PlanExerciseSlot) => ({
      ...slot,
      prescription: {
        ...slot.prescription,
        repRange: { ...slot.prescription.repRange },
        rirRange: { ...slot.prescription.rirRange },
      },
    })),
  }));
}
