import type { ExerciseSlot, Prescription, WorkoutBody } from './workouts';
import { exerciseSlots, formatRange } from './workouts';

/**
 * Compares two snapshots of one workout and produces both a structured diff
 * and a readable one-line summary (§2.5), e.g.
 * *"Added Incline DB Press, removed Cable Fly, Bench Press 3→4 sets."*
 *
 * Slots match on `slotId`, so reordering is not mistaken for churn and a
 * prescription change reads as a change rather than a delete plus an add.
 *
 * The same function serves two callers: generating a version's changeSummary
 * on publish, and previewing a merge on import (§2.9).
 */

export type PrescriptionField = 'sets' | 'reps' | 'rir' | 'rest' | 'loadHint';

export type PrescriptionChange = {
  field: PrescriptionField;
  before: string;
  after: string;
};

export type WorkoutChange =
  /** First publish: there is no previous snapshot to compare against. */
  | { kind: 'created'; name: string; exerciseCount: number }
  | { kind: 'renamed'; before: string; after: string }
  | { kind: 'exercise-added'; exerciseName: string; slotId: string }
  | { kind: 'exercise-removed'; exerciseName: string; slotId: string }
  | {
      kind: 'prescription-changed';
      exerciseName: string;
      slotId: string;
      fields: PrescriptionChange[];
    }
  | {
      kind: 'superset-changed';
      exerciseName: string;
      slotId: string;
      before: string | null;
      after: string | null;
    }
  | { kind: 'notes-changed'; exerciseName: string; slotId: string };

export type WorkoutDiff = {
  changes: WorkoutChange[];
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

function slotsById(slots: readonly ExerciseSlot[]): Map<string, ExerciseSlot> {
  return new Map(slots.map((slot) => [slot.slotId, slot]));
}

/**
 * `before` is null for a workout with nothing published yet.
 *
 * That case reports one `created` change rather than an "added X" clause per
 * exercise: a first publish of eight exercises is one event, and listing all
 * eight would bury it.
 */
export function diffWorkout(before: WorkoutBody | null, after: WorkoutBody): WorkoutDiff {
  if (before === null) {
    const created: WorkoutChange[] = [
      { kind: 'created', name: after.name, exerciseCount: exerciseSlots(after.slots).length },
    ];
    return { changes: created, summary: summarize(created), hasChanges: true };
  }

  const changes: WorkoutChange[] = [];

  if (before.name !== after.name) {
    changes.push({ kind: 'renamed', before: before.name, after: after.name });
  }

  const beforeSlots = slotsById(before.slots);
  const afterSlots = slotsById(after.slots);

  for (const slot of after.slots) {
    if (!beforeSlots.has(slot.slotId)) {
      changes.push({
        kind: 'exercise-added',
        exerciseName: slot.exerciseName,
        slotId: slot.slotId,
      });
    }
  }

  for (const slot of before.slots) {
    if (!afterSlots.has(slot.slotId)) {
      changes.push({
        kind: 'exercise-removed',
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
        exerciseName: afterSlot.exerciseName,
        slotId: afterSlot.slotId,
        fields,
      });
    }

    if (beforeSlot.supersetGroup !== afterSlot.supersetGroup) {
      changes.push({
        kind: 'superset-changed',
        exerciseName: afterSlot.exerciseName,
        slotId: afterSlot.slotId,
        before: beforeSlot.supersetGroup,
        after: afterSlot.supersetGroup,
      });
    }

    if (beforeSlot.notes !== afterSlot.notes) {
      changes.push({
        kind: 'notes-changed',
        exerciseName: afterSlot.exerciseName,
        slotId: afterSlot.slotId,
      });
    }
  }

  return {
    changes,
    summary: summarize(changes),
    hasChanges: changes.length > 0,
  };
}

const FIELD_NOUNS: Record<PrescriptionField, string> = {
  sets: 'sets',
  reps: 'reps',
  rir: 'RIR',
  rest: 'rest',
  loadHint: 'load note',
};

/** One human-readable clause per change. */
export function describeChange(change: WorkoutChange): string {
  switch (change.kind) {
    case 'created':
      return change.exerciseCount === 1
        ? `created ${change.name} with 1 exercise`
        : `created ${change.name} with ${String(change.exerciseCount)} exercises`;
    case 'renamed':
      return `renamed ${change.before} to ${change.after}`;
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
export function summarize(changes: readonly WorkoutChange[]): string {
  if (changes.length === 0) return 'No changes';

  const clauses = changes.slice(0, SUMMARY_LIMIT).map(describeChange);
  const remaining = changes.length - clauses.length;
  if (remaining > 0) {
    clauses.push(remaining === 1 ? '1 more change' : `${String(remaining)} more changes`);
  }

  const joined = clauses.join(', ');
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

/** True when two snapshots are equivalent — used to skip pointless versions. */
export function bodiesEqual(a: WorkoutBody, b: WorkoutBody): boolean {
  return !diffWorkout(a, b).hasChanges;
}

/**
 * True when `body` differs from the last published snapshot.
 *
 * False when `published` is null while `currentVersion` is above 0: the
 * version list has not loaded, so no change is known yet.
 */
export function hasUnpublishedChanges(
  published: WorkoutBody | null,
  currentVersion: number,
  body: WorkoutBody,
): boolean {
  if (published === null && currentVersion > 0) return false;
  return diffWorkout(published, body).hasChanges;
}

/** Deep-copies a body so a snapshot cannot alias the editable working copy. */
export function cloneBody(body: WorkoutBody): WorkoutBody {
  return {
    name: body.name,
    groupRest: { ...body.groupRest },
    slots: body.slots.map((slot: ExerciseSlot) => ({
      ...slot,
      prescription: {
        ...slot.prescription,
        repRange: { ...slot.prescription.repRange },
        rirRange: { ...slot.prescription.rirRange },
      },
    })),
  };
}
