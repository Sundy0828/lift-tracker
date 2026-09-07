import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Workout } from '@/domain/workouts';
import { toWorkout } from '../converters/workout';
import { paths } from '../paths';
import { useAuth } from './useAuth';

export type WorkoutsState = {
  workouts: readonly Workout[];
  isPending: boolean;
  hasPendingWrites: boolean;
};

const PENDING: WorkoutsState = { workouts: [], isPending: true, hasPendingWrites: false };

type Snapshot = WorkoutsState & { uid: string };

/** Every workout the user owns, newest first. */
export function useWorkouts(): WorkoutsState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(
      query(paths.workouts(uid), orderBy('createdAt', 'desc')),
      { includeMetadataChanges: true },
      (next) => {
        setSnapshot({
          uid,
          workouts: next.docs.map((document) => toWorkout(document.id, document.data())),
          isPending: false,
          hasPendingWrites: next.metadata.hasPendingWrites,
        });
      },
    );
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
