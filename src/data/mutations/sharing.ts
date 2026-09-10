import { Timestamp, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import type { ImportPlan, SharePayload } from '@/domain/sharing';
import { importAsNewBody } from '@/domain/sharing';
import { diffWorkout } from '@/domain/workoutDiff';
import type { Workout, WorkoutBody } from '@/domain/workouts';
import { db } from '../firestore';
import { paths } from '../paths';

/**
 * Publishing a share, and taking one in (§2.9).
 *
 * Two things are different here from every other write in the app.
 *
 * **These are batched and awaited.** An import creates custom exercises, a
 * workout, and its first version; a merge creates exercises and publishes a
 * version. Half of either is worse than none — a workout referencing exercise
 * ids that were never written renders as a list of blanks — so each is one
 * atomic batch. They are still cache-first, so they work offline; the batch is
 * about atomicity, not about waiting for the server.
 *
 * **A share is the only document written outside `users/{uid}`.** Its
 * `ownerUid` is what the security rules key on, so it is written on create and
 * never touched again.
 */

/**
 * Share ids are minted client-side, like every other id in the app.
 *
 * A uuid rather than a short code: the link is the only access control on a
 * public document, so it has to be unguessable. There is no listing of other
 * people's shares, so nothing else can enumerate them.
 */
export function newShareId(): string {
  return crypto.randomUUID();
}

export function publishShare(shareId: string, payload: SharePayload): Promise<void> {
  return setDoc(paths.sharedWorkout(shareId), {
    ...payload,
    slots: payload.slots.map((slot) => ({ ...slot })),
    // Client time, for the same reason as `createdAt` elsewhere: a pending
    // server timestamp reads back as null from the local cache, and the owner
    // is shown this the instant they press Share.
    createdAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Revoking, which is a flag rather than a delete.
 *
 * A deleted document is indistinguishable from a mistyped link, and "this
 * share was turned off" is a more useful thing for a recipient to be told than
 * "not found". Keeping it also means the owner can see what they have shared.
 */
export function setShareRevoked(shareId: string, revoked: boolean): Promise<void> {
  return setDoc(
    paths.sharedWorkout(shareId),
    { revoked, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

function writeCustomExercises(
  batch: ReturnType<typeof writeBatch>,
  uid: string,
  plan: ImportPlan,
): void {
  for (const exercise of plan.create) {
    batch.set(paths.customExercise(uid, exercise.newId), {
      name: exercise.name,
      primaryMuscles: [...exercise.primaryMuscles],
      secondaryMuscles: [...exercise.secondaryMuscles],
      equipment: exercise.equipment,
      isCustom: true,
      createdAt: Timestamp.now(),
    });
  }
}

export type ImportResult = { workoutId: string; changeSummary: string };

/**
 * Imports a share as a brand-new workout.
 *
 * The new `workoutId` is what makes the importer's overlay history start clean
 * (§2.9): none of the sender's numbers come across, and nothing in the
 * importer's past is keyed to this workout yet.
 *
 * It lands published as v1 rather than as an unpublished draft. An import is a
 * complete workout someone else has already been using, and leaving it
 * unpublished would mean you could not start a session with it without first
 * pressing Publish on a workout you did not write.
 */
export function importSharedWorkout(
  uid: string,
  workoutId: string,
  plan: ImportPlan,
): { promise: Promise<void>; result: ImportResult } {
  const body = importAsNewBody(plan);
  const changeSummary = diffWorkout(null, body).summary;

  const batch = writeBatch(db);
  writeCustomExercises(batch, uid, plan);

  batch.set(paths.workout(uid, workoutId), {
    ...body,
    notes: '',
    currentVersion: 1,
    archivedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });

  batch.set(paths.workoutVersion(uid, workoutId, 1), {
    ...body,
    versionNumber: 1,
    createdAt: Timestamp.now(),
    changeSummary,
  });

  return { promise: batch.commit(), result: { workoutId, changeSummary } };
}

export type MergeResult = { versionNumber: number; changeSummary: string };

/**
 * Publishes the merged body as the target's next version.
 *
 * The target keeps its `workoutId`, so its overlay history survives the merge
 * — that is the whole difference between this and an import. No existing
 * version document is touched: a merge that would need to rewrite one is a new
 * version instead (§2.5).
 */
export function mergeSharedWorkout(
  uid: string,
  target: Workout,
  merged: WorkoutBody,
  previous: WorkoutBody | null,
  plan: ImportPlan,
): { promise: Promise<void>; result: MergeResult } {
  const versionNumber = target.currentVersion + 1;
  const changeSummary = diffWorkout(previous, merged).summary;

  const batch = writeBatch(db);
  writeCustomExercises(batch, uid, plan);

  batch.set(paths.workoutVersion(uid, target.id, versionNumber), {
    ...merged,
    versionNumber,
    createdAt: Timestamp.now(),
    changeSummary,
  });

  batch.set(
    paths.workout(uid, target.id),
    { ...merged, currentVersion: versionNumber, updatedAt: serverTimestamp() },
    { merge: true },
  );

  return { promise: batch.commit(), result: { versionNumber, changeSummary } };
}
