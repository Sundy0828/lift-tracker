import { Timestamp, deleteDoc, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { cloneWorkouts, diffPlans } from '@/domain/planDiff';
import type { Plan, PlanWorkout } from '@/domain/plans';
import { db } from '../firestore';
import { paths } from '../paths';

/**
 * Plan writes. None are awaited by the UI: Firestore applies them to the
 * local cache immediately and flushes on reconnect (§2.8).
 *
 * The working copy at `plans/{planId}` is edited freely — drafts are cheap.
 * Publishing writes an immutable `versions/{n}` snapshot and bumps
 * `currentVersion` in one batch, so a reader never sees a pointer without its
 * snapshot (§2.5).
 *
 * `createdAt` and `archivedAt` use a **client** timestamp, not
 * `serverTimestamp()`. A pending server timestamp reads back as null from the
 * local cache, so archiving a plan offline would appear to do nothing and a
 * new plan would sort last. Both are user-action times with no need for server
 * authority. `updatedAt` keeps the server timestamp: nothing renders or sorts
 * on it, so its local null is harmless.
 */

export function newId(): string {
  return crypto.randomUUID();
}

export function createPlan(uid: string, planId: string, name: string): Promise<void> {
  return setDoc(paths.plan(uid, planId), {
    name: name.trim(),
    notes: '',
    currentVersion: 0,
    workoutOrder: [],
    workouts: [],
    archivedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}

/** Overwrites the working copy's workouts and order. */
export function savePlanWorkouts(
  uid: string,
  planId: string,
  workouts: readonly PlanWorkout[],
): Promise<void> {
  return setDoc(
    paths.plan(uid, planId),
    {
      workouts: cloneWorkouts(workouts),
      workoutOrder: workouts.map((workout) => workout.workoutId),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function savePlanDetails(
  uid: string,
  planId: string,
  details: { name?: string; notes?: string },
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (details.name !== undefined) payload['name'] = details.name.trim();
  if (details.notes !== undefined) payload['notes'] = details.notes;
  return setDoc(paths.plan(uid, planId), payload, { merge: true });
}

export function archivePlan(uid: string, planId: string, archived: boolean): Promise<void> {
  return setDoc(
    paths.plan(uid, planId),
    { archivedAt: archived ? Timestamp.now() : null, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function deletePlan(uid: string, planId: string): Promise<void> {
  // Versions are left in place: they are immutable history, and Firestore
  // deletes no subcollections implicitly. Phase 4 owns any cleanup policy.
  return deleteDoc(paths.plan(uid, planId));
}

/**
 * Throws away unpublished edits by resetting the working copy to a published
 * snapshot.
 *
 * Edits still auto-save as they are made — so being interrupted never loses
 * work — and this is the explicit way back out. `currentVersion` is left
 * alone: reverting to v1 does not create a v2, because nothing was published.
 */
export function discardPlanChanges(
  uid: string,
  planId: string,
  publishedWorkouts: readonly PlanWorkout[],
): Promise<void> {
  return setDoc(
    paths.plan(uid, planId),
    {
      workouts: cloneWorkouts(publishedWorkouts),
      workoutOrder: publishedWorkouts.map((workout) => workout.workoutId),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type PublishResult = { versionNumber: number; changeSummary: string };

/**
 * Snapshots the working copy as the next version.
 *
 * `previousWorkouts` is passed in rather than read back, so publishing needs
 * no round trip and works offline. Version documents are never rewritten —
 * anything that would require it is a new version (§2.5).
 */
export function publishPlanVersion(
  uid: string,
  plan: Plan,
  workouts: readonly PlanWorkout[],
  previousWorkouts: readonly PlanWorkout[],
): { promise: Promise<void>; result: PublishResult } {
  const versionNumber = plan.currentVersion + 1;
  const changeSummary = diffPlans(previousWorkouts, workouts).summary;

  const batch = writeBatch(db);
  batch.set(doc(paths.planVersions(uid, plan.id), String(versionNumber)), {
    versionNumber,
    createdAt: serverTimestamp(),
    changeSummary,
    workouts: cloneWorkouts(workouts),
  });
  batch.set(
    paths.plan(uid, plan.id),
    {
      currentVersion: versionNumber,
      workouts: cloneWorkouts(workouts),
      workoutOrder: workouts.map((workout) => workout.workoutId),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { promise: batch.commit(), result: { versionNumber, changeSummary } };
}
