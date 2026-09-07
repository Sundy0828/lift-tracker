import { Timestamp, deleteDoc, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import type { Workout, WorkoutBody } from '@/domain/workouts';
import { cloneBody, diffWorkout } from '@/domain/workoutDiff';
import { db } from '../firestore';
import { paths } from '../paths';

/**
 * Workout writes. None are awaited by the UI: Firestore applies them to the
 * local cache immediately and flushes on reconnect (§2.8).
 *
 * The working copy at `workouts/{workoutId}` is edited freely — drafts are
 * cheap. Publishing writes an immutable `versions/{n}` snapshot and bumps
 * `currentVersion` in one batch, so a reader never sees a pointer without its
 * snapshot (§2.5).
 *
 * `createdAt` and `archivedAt` use a **client** timestamp, not
 * `serverTimestamp()`. A pending server timestamp reads back as null from the
 * local cache, so archiving a workout offline would appear to do nothing and a
 * new workout would sort last. Both are user-action times with no need for
 * server authority. `updatedAt` keeps the server timestamp: nothing renders or
 * sorts on it, so its local null is harmless.
 */

export function newId(): string {
  return crypto.randomUUID();
}

export function createWorkout(uid: string, workoutId: string, name: string): Promise<void> {
  return setDoc(paths.workout(uid, workoutId), {
    name: name.trim(),
    notes: '',
    currentVersion: 0,
    slots: [],
    groupRest: {},
    archivedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}

/** Overwrites the working copy's versioned content. */
export function saveWorkoutBody(uid: string, workoutId: string, body: WorkoutBody): Promise<void> {
  return setDoc(
    paths.workout(uid, workoutId),
    { ...cloneBody(body), updatedAt: serverTimestamp() },
    {
      merge: true,
    },
  );
}

/** Notes are not versioned — a running scratchpad, not a prescription. */
export function saveWorkoutNotes(uid: string, workoutId: string, notes: string): Promise<void> {
  return setDoc(
    paths.workout(uid, workoutId),
    { notes, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function archiveWorkout(uid: string, workoutId: string, archived: boolean): Promise<void> {
  return setDoc(
    paths.workout(uid, workoutId),
    { archivedAt: archived ? Timestamp.now() : null, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function deleteWorkout(uid: string, workoutId: string): Promise<void> {
  // Versions are left in place: they are immutable history, and Firestore
  // deletes no subcollections implicitly. Phase 4 owns any cleanup policy.
  return deleteDoc(paths.workout(uid, workoutId));
}

/**
 * Throws away unpublished edits by resetting the working copy to a published
 * snapshot.
 *
 * Edits still auto-save as they are made — so being interrupted never loses
 * work — and this is the explicit way back out. `currentVersion` is left
 * alone: reverting to v1 does not create a v2, because nothing was published.
 */
export function discardWorkoutChanges(
  uid: string,
  workoutId: string,
  published: WorkoutBody,
): Promise<void> {
  return saveWorkoutBody(uid, workoutId, published);
}

export type PublishResult = { versionNumber: number; changeSummary: string };

/**
 * Snapshots the working copy as the next version.
 *
 * `previous` is passed in rather than read back, so publishing needs no round
 * trip and works offline; null means nothing has been published yet. Version
 * documents are never rewritten — anything that would require it is a new
 * version (§2.5).
 */
export function publishWorkoutVersion(
  uid: string,
  workout: Workout,
  body: WorkoutBody,
  previous: WorkoutBody | null,
): { promise: Promise<void>; result: PublishResult } {
  const versionNumber = workout.currentVersion + 1;
  const changeSummary = diffWorkout(previous, body).summary;
  const snapshot = cloneBody(body);

  const batch = writeBatch(db);
  batch.set(doc(paths.workoutVersions(uid, workout.id), String(versionNumber)), {
    ...snapshot,
    versionNumber,
    createdAt: serverTimestamp(),
    changeSummary,
  });
  batch.set(
    paths.workout(uid, workout.id),
    { ...snapshot, currentVersion: versionNumber, updatedAt: serverTimestamp() },
    { merge: true },
  );

  return { promise: batch.commit(), result: { versionNumber, changeSummary } };
}
