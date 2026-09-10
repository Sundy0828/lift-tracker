import type { Equipment, Exercise } from './exercises';
import { isCustomExerciseId, normalizeExerciseName, parseCustomExercise } from './exercises';
import type { MuscleGroup } from './muscles';
import type { WorkoutChange } from './workoutDiff';
import { diffWorkout } from './workoutDiff';
import type { ExerciseSlot, WorkoutBody } from './workouts';
import { parseWorkoutBody, pruneGroupRest, reconcileGroups, slotOccurrenceKey } from './workouts';

/**
 * Publishing a workout, and taking one in (§2.9).
 *
 * Everything here is pure. Two ideas carry the whole module:
 *
 * **A share is self-contained.** The recipient cannot resolve the sender's
 * custom-exercise ids — they live under the sender's uid and are unreadable —
 * so the payload inlines the full definition of every custom exercise the
 * workout references. Catalog exercises travel as an id alone, because the
 * catalog is bundled identically in every copy of the app (§2.2).
 *
 * **A share is untrusted input.** `sharedWorkouts` is public-read and any
 * signed-in account can create one, so a payload is a stranger's JSON, not our
 * data. It goes through the same defensive parsers as a Firestore document —
 * which clamp sets, reps, and rest to the app's caps — and anything without a
 * usable identity is dropped rather than repaired.
 */

/** A custom exercise carried inside a share, stripped of its owner's ids. */
export type SharedCustomExercise = {
  /** The **sender's** id. Only ever used to rewire the payload's own slots. */
  id: string;
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment | null;
};

export type SharedWorkout = {
  shareId: string;
  ownerUid: string;
  /** The sender's workout id. Bookkeeping for the sender; never imported. */
  sourceWorkoutId: string;
  /** Which version was published. Shown so a recipient knows what they have. */
  versionNumber: number;
  body: WorkoutBody;
  customExercises: SharedCustomExercise[];
  revoked: boolean;
  createdAt: string | null;
};

/** The fields written to `sharedWorkouts/{shareId}`, minus server timestamps. */
export type SharePayload = {
  ownerUid: string;
  sourceWorkoutId: string;
  versionNumber: number;
  name: string;
  slots: ExerciseSlot[];
  groupRest: Record<string, number | null>;
  customExercises: SharedCustomExercise[];
  revoked: boolean;
};

/** Every distinct custom-exercise id a body references, in slot order. */
export function customExerciseIds(body: WorkoutBody): string[] {
  const ids: string[] = [];
  for (const slot of body.slots) {
    if (!isCustomExerciseId(slot.exerciseId)) continue;
    if (!ids.includes(slot.exerciseId)) ids.push(slot.exerciseId);
  }
  return ids;
}

/**
 * Builds the document for a share.
 *
 * `resolve` is the sender's own library. An id it cannot resolve is a custom
 * exercise that has since been deleted; the slot keeps working — its
 * `exerciseName` is denormalised for exactly this reason — so the definition
 * is synthesised from the name rather than dropping the exercise and silently
 * sharing a shorter workout than the one on screen.
 */
export function buildSharePayload(input: {
  ownerUid: string;
  sourceWorkoutId: string;
  versionNumber: number;
  body: WorkoutBody;
  resolve: (id: string) => Exercise | null;
}): SharePayload {
  const { ownerUid, sourceWorkoutId, versionNumber, body, resolve } = input;

  const customExercises = customExerciseIds(body).map((id): SharedCustomExercise => {
    const exercise = resolve(id);
    const fallbackName = body.slots.find((slot) => slot.exerciseId === id)?.exerciseName ?? id;
    return {
      id,
      name: exercise?.name ?? fallbackName,
      primaryMuscles: [...(exercise?.primaryMuscles ?? [])],
      secondaryMuscles: [...(exercise?.secondaryMuscles ?? [])],
      equipment: exercise?.equipment ?? null,
    };
  });

  return {
    ownerUid,
    sourceWorkoutId,
    versionNumber,
    name: body.name,
    slots: body.slots.map((slot) => ({ ...slot })),
    groupRest: { ...body.groupRest },
    customExercises,
    revoked: false,
  };
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Narrows a share document. Returns null only when it has no usable identity
 * at all — no owner — since everything else has a safe default.
 */
export function parseSharedWorkout(
  shareId: string,
  data: Record<string, unknown> | undefined,
): SharedWorkout | null {
  if (data === undefined) return null;

  const ownerUid = asString(data['ownerUid']);
  if (ownerUid === '') return null;

  const versionNumber: unknown = data['versionNumber'];
  const createdAt: unknown = data['createdAt'];

  return {
    shareId,
    ownerUid,
    sourceWorkoutId: asString(data['sourceWorkoutId']),
    versionNumber:
      typeof versionNumber === 'number' && Number.isFinite(versionNumber)
        ? Math.max(1, Math.round(versionNumber))
        : 1,
    body: parseWorkoutBody(data),
    customExercises: parseSharedCustomExercises(data['customExercises']),
    // Absent means revoked, not live: a document written by an older client, or
    // by hand, must not be readable by default. The rules take the same view.
    revoked: data['revoked'] !== false,
    createdAt: typeof createdAt === 'string' ? createdAt : null,
  };
}

function parseSharedCustomExercises(value: unknown): SharedCustomExercise[] {
  if (!Array.isArray(value)) return [];

  const parsed: SharedCustomExercise[] = [];
  const seen = new Set<string>();

  for (const raw of value as readonly unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const id = asString(record['id']);
    if (id === '' || seen.has(id)) continue;
    seen.add(id);

    const exercise = parseCustomExercise(id, record);
    parsed.push({
      id,
      // A definition with no name is unusable as a dedupe key, so the id
      // stands in — it will simply never match anything the importer owns.
      name: exercise.name === '' ? id : exercise.name,
      primaryMuscles: [...exercise.primaryMuscles],
      secondaryMuscles: [...exercise.secondaryMuscles],
      equipment: exercise.equipment,
    });
  }

  return parsed;
}

export type ImportPlan = {
  /** The body with every custom reference rewired to the importer's ids. */
  body: WorkoutBody;
  /** Definitions to create under the importer's account. */
  create: (SharedCustomExercise & { newId: string })[];
  /** Sender id → importer id, for every custom exercise in the payload. */
  mapping: Map<string, string>;
  /** Exercises matched to one the importer already owns, by name. */
  reused: { name: string; id: string }[];
};

/**
 * Works out what importing this share would mean for the importer's library.
 *
 * Custom exercises are deduped against what they already own by normalised
 * name (§2.9), so importing the same workout twice does not leave two "Copenhagen
 * Plank" entries behind. `mintId` is injected so this stays pure and the ids
 * are predictable in tests.
 *
 * Catalog references are left alone — the same id means the same lift in every
 * copy of the app, which is the entire reason the catalog is bundled.
 */
export function planImport(
  shared: SharedWorkout,
  mine: readonly Exercise[],
  mintId: () => string,
): ImportPlan {
  const mineByName = new Map<string, Exercise>();
  for (const exercise of mine) {
    if (!exercise.isCustom) continue;
    const key = normalizeExerciseName(exercise.name);
    // First wins: `mine` is name-sorted, so this is stable rather than
    // dependent on however the list happened to arrive.
    if (!mineByName.has(key)) mineByName.set(key, exercise);
  }

  const mapping = new Map<string, string>();
  const create: (SharedCustomExercise & { newId: string })[] = [];
  const reused: { name: string; id: string }[] = [];
  const names = new Map<string, string>();

  for (const incoming of shared.customExercises) {
    const existing = mineByName.get(normalizeExerciseName(incoming.name));
    if (existing !== undefined) {
      mapping.set(incoming.id, existing.id);
      reused.push({ name: existing.name, id: existing.id });
      // Their name for it, not the sender's: this is the importer's library.
      names.set(incoming.id, existing.name);
      continue;
    }
    const newId = mintId();
    mapping.set(incoming.id, newId);
    create.push({ ...incoming, newId });
    names.set(incoming.id, incoming.name);
  }

  const slots = shared.body.slots.map((slot) => {
    const mapped = mapping.get(slot.exerciseId);
    if (mapped === undefined) return { ...slot };
    return {
      ...slot,
      exerciseId: mapped,
      exerciseName: names.get(slot.exerciseId) ?? slot.exerciseName,
    };
  });

  return {
    body: { name: shared.body.name, slots, groupRest: { ...shared.body.groupRest } },
    create,
    mapping,
    reused,
  };
}

/**
 * Renumbers occurrence indices per exercise, in slot order.
 *
 * Needed after an import remaps ids: if two of the sender's custom exercises
 * dedupe onto one of the importer's, both slots would land on the same
 * `exerciseId#occurrenceIndex` and become one lift as far as the overlay is
 * concerned (§2.6). Safe to do on an import-as-new because the workout id is
 * fresh, so there is no history keyed on the old indices — and never done on a
 * merge, where the target's keys are exactly what must survive.
 */
export function renumberOccurrences(body: WorkoutBody): WorkoutBody {
  const counts = new Map<string, number>();
  const slots = body.slots.map((slot) => {
    const used = counts.get(slot.exerciseId) ?? 0;
    counts.set(slot.exerciseId, used + 1);
    return { ...slot, occurrenceIndex: used };
  });
  return { ...body, slots };
}

/** A fresh, self-consistent body for "import as a new workout". */
export function importAsNewBody(plan: ImportPlan): WorkoutBody {
  return pruneGroupRest(renumberOccurrences({ ...plan.body, slots: [...plan.body.slots] }));
}

/**
 * Rewrites the incoming body's slot ids onto the target's, matching on
 * occurrence key.
 *
 * `workoutDiff` matches slots on `slotId`, which is right within one workout's
 * history and useless across two: the sender's ids mean nothing here, so every
 * slot would read as a removal plus an addition and the preview would be noise.
 * The occurrence key — `exerciseId#occurrenceIndex` — is the identity that does
 * carry across, and it is the same key the overlay uses, so aligning on it is
 * what makes "Bench Press 3→4 sets" come out as a change rather than churn.
 *
 * Slots with no counterpart keep their own id and so read as additions, which
 * is what they are.
 */
export function alignForMerge(target: WorkoutBody, incoming: WorkoutBody): WorkoutBody {
  const targetByKey = new Map<string, ExerciseSlot>();
  for (const slot of target.slots) {
    const key = slotOccurrenceKey(slot);
    if (!targetByKey.has(key)) targetByKey.set(key, slot);
  }

  const claimed = new Set<string>();
  const slots = incoming.slots.map((slot) => {
    const key = slotOccurrenceKey(slot);
    const match = targetByKey.get(key);
    // One target slot can only be the counterpart of one incoming slot.
    if (match === undefined || claimed.has(match.slotId)) return { ...slot };
    claimed.add(match.slotId);
    return { ...slot, slotId: match.slotId };
  });

  return { ...incoming, slots };
}

/**
 * A stable identity for one change, for per-change checkboxes.
 *
 * Keyed on kind plus slot so two changes to the same slot — a new prescription
 * and a new note — can be accepted independently.
 */
export function changeKey(change: WorkoutChange): string {
  switch (change.kind) {
    case 'created':
      return 'created';
    case 'renamed':
      return 'renamed';
    default:
      return `${change.kind}:${change.slotId}`;
  }
}

export type MergePreview = {
  /** The incoming body, aligned to the target. Feed this to `applyMerge`. */
  aligned: WorkoutBody;
  changes: WorkoutChange[];
  /** Change keys that are safe to have ticked by default. */
  defaultSelection: string[];
};

/**
 * Changes a default must never make on someone's behalf.
 *
 * A removal throws away a lift the importer chose to have, along with the
 * overlay history keyed to it. A rename overwrites the name they gave their
 * own workout — you are merging somebody else's PUSH into *yours*, and coming
 * back to find it called theirs is not what was asked for. Both are offered,
 * neither is assumed.
 */
const UNTICKED: readonly WorkoutChange['kind'][] = ['exercise-removed', 'renamed'];

/**
 * What merging this share into `target` would change, ready for a preview.
 *
 * Additive changes — a new exercise, a new prescription, a note — are ticked;
 * anything that overwrites or discards what the importer already chose is left
 * for them to opt into. See {@link UNTICKED}.
 */
export function previewMerge(target: WorkoutBody, incoming: WorkoutBody): MergePreview {
  const aligned = alignForMerge(target, incoming);
  const { changes } = diffWorkout(target, aligned);

  return {
    aligned,
    changes,
    defaultSelection: changes
      .filter((change) => !UNTICKED.includes(change.kind))
      .map((change) => changeKey(change)),
  };
}

/**
 * Applies the accepted changes to the target, producing the body to publish as
 * its next version.
 *
 * The target's order is preserved and accepted additions are appended, rather
 * than trying to reproduce the sender's layout. Order is not one of the
 * changes on offer, so rearranging the importer's workout would be a change
 * nobody agreed to.
 *
 * Never mutates either input, and never touches an existing version document:
 * the result is a new body for a new version (§2.9).
 */
export function applyMerge(
  target: WorkoutBody,
  aligned: WorkoutBody,
  selected: ReadonlySet<string>,
): WorkoutBody {
  const incomingById = new Map(aligned.slots.map((slot) => [slot.slotId, slot]));
  const targetIds = new Set(target.slots.map((slot) => slot.slotId));

  const slots: ExerciseSlot[] = [];

  for (const slot of target.slots) {
    if (selected.has(`exercise-removed:${slot.slotId}`)) continue;

    const incoming = incomingById.get(slot.slotId);
    if (incoming === undefined) {
      slots.push({ ...slot });
      continue;
    }

    slots.push({
      ...slot,
      prescription: selected.has(`prescription-changed:${slot.slotId}`)
        ? { ...incoming.prescription }
        : { ...slot.prescription },
      notes: selected.has(`notes-changed:${slot.slotId}`) ? incoming.notes : slot.notes,
      supersetGroup: selected.has(`superset-changed:${slot.slotId}`)
        ? incoming.supersetGroup
        : slot.supersetGroup,
    });
  }

  for (const slot of aligned.slots) {
    if (targetIds.has(slot.slotId)) continue;
    if (!selected.has(`exercise-added:${slot.slotId}`)) continue;
    slots.push({ ...slot });
  }

  const groupRest: Record<string, number | null> = { ...target.groupRest };
  for (const [groupId, rest] of Object.entries(aligned.groupRest)) {
    // The target's own round rests win: they are a setting of theirs, not part
    // of any change on the list.
    if (!(groupId in groupRest)) groupRest[groupId] = rest;
  }

  const name = selected.has('renamed') ? aligned.name : target.name;

  // Appended circuit members can leave a group split across the list, which
  // `reconcileGroups` resolves the same way a drag does.
  return pruneGroupRest({ name, slots: reconcileGroups(slots), groupRest });
}

/**
 * The custom exercises an importer would gain, named for a confirmation.
 *
 * Worth showing before the fact: importing writes to their exercise library,
 * which is not what "import a workout" sounds like it does.
 */
export function describeNewExercises(plan: ImportPlan): string[] {
  return plan.create.map((exercise) => exercise.name);
}
