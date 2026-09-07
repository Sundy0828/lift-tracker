import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Workout, WorkoutVersion } from '@/domain/workouts';
import { toWorkout, toWorkoutVersion } from '../converters/workout';
import { paths } from '../paths';
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

    return onSnapshot(paths.workout(uid, workoutId), { includeMetadataChanges: true }, (next) => {
      setSnapshot({
        key,
        workout: next.exists() ? toWorkout(next.id, next.data()) : null,
        hasPendingWrites: next.metadata.hasPendingWrites,
        notFound: !next.exists() && !next.metadata.fromCache,
      });
    });
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
