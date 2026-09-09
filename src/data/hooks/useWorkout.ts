import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Workout, WorkoutVersion } from '@/domain/workouts';
import { toWorkout, toWorkoutVersion } from '../converters/workout';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';

export type WorkoutState = {
  workout: Workout | null;
  /** Immutable snapshots, newest first. */
  versions: readonly WorkoutVersion[];
  isPending: boolean;
  hasPendingWrites: boolean;
  /** True when the document does not exist (deleted, or a bad link). */
  notFound: boolean;
};

const PENDING: WorkoutState = {
  workout: null,
  versions: [],
  isPending: true,
  hasPendingWrites: false,
  notFound: false,
};

type Snapshot = {
  key: string;
  workout: Workout | null;
  hasPendingWrites: boolean;
  notFound: boolean;
};

/**
 * One workout's working copy plus its version history. Two listeners rather
 * than one, because a version list changes only on publish while the working
 * copy changes on every keystroke-level edit.
 */
export function useWorkout(workoutId: string | null): WorkoutState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid === null || workoutId === null ? null : `${uid}/${workoutId}`;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [versions, setVersions] = useState<{ key: string; list: WorkoutVersion[] } | null>(null);

  useEffect(() => {
    if (uid === null || workoutId === null || key === null) return;

    const syncKey = `workout:${key}`;

    const unsubscribe = onSnapshot(
      paths.workout(uid, workoutId),
      { includeMetadataChanges: true },
      (next) => {
        reportSync(syncKey, {
          pending: next.metadata.hasPendingWrites,
          fromCache: next.metadata.fromCache,
        });

        setSnapshot({
          key,
          workout: next.exists() ? toWorkout(next.id, next.data()) : null,
          hasPendingWrites: next.metadata.hasPendingWrites,
          notFound: !next.exists() && !next.metadata.fromCache,
        });
      },
    );

    return () => {
      unsubscribe();
      releaseSync(syncKey);
    };
  }, [uid, workoutId, key]);

  useEffect(() => {
    if (uid === null || workoutId === null || key === null) return;

    return onSnapshot(
      query(paths.workoutVersions(uid, workoutId), orderBy('versionNumber', 'desc')),
      (next) => {
        setVersions({
          key,
          list: next.docs.map((document) => toWorkoutVersion(document.id, document.data())),
        });
      },
    );
  }, [uid, workoutId, key]);

  if (key === null || snapshot?.key !== key) return PENDING;

  return {
    workout: snapshot.workout,
    versions: versions?.key === key ? versions.list : [],
    isPending: false,
    hasPendingWrites: snapshot.hasPendingWrites,
    notFound: snapshot.notFound,
  };
}

export type WorkoutVersionState = {
  version: WorkoutVersion | null;
  isPending: boolean;
  /** The snapshot is genuinely absent, not merely uncached. */
  notFound: boolean;
};

const VERSION_PENDING: WorkoutVersionState = { version: null, isPending: true, notFound: false };
const VERSION_NONE: WorkoutVersionState = { version: null, isPending: false, notFound: true };

/**
 * One immutable snapshot, by number — the archaeology view's authority.
 *
 * A session records which version it was performed against, and history
 * renders it against *that*, never the live workout (§2.5). Reading the
 * workout instead would show week 1 under week 3's exercises, which is the
 * exact failure the versioning exists to prevent.
 */
export function useWorkoutVersion(
  workoutId: string | null,
  versionNumber: number | null,
): WorkoutVersionState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key =
    uid === null || workoutId === null || versionNumber === null
      ? null
      : `${uid}/${workoutId}/${String(versionNumber)}`;

  const [snapshot, setSnapshot] = useState<(WorkoutVersionState & { key: string }) | null>(null);

  useEffect(() => {
    if (uid === null || workoutId === null || versionNumber === null || key === null) return;

    return onSnapshot(
      paths.workoutVersion(uid, workoutId, versionNumber),
      { includeMetadataChanges: true },
      (next) => {
        setSnapshot({
          key,
          version: next.exists() ? toWorkoutVersion(next.id, next.data()) : null,
          isPending: false,
          notFound: !next.exists() && !next.metadata.fromCache,
        });
      },
    );
  }, [uid, workoutId, versionNumber, key]);

  // An ad-hoc session, or one logged before its workout was ever published,
  // has no snapshot to wait for. That is a fact, not a pending read.
  if (workoutId === null || versionNumber === null) return VERSION_NONE;
  if (key === null || snapshot?.key !== key) return VERSION_PENDING;
  return snapshot;
}
