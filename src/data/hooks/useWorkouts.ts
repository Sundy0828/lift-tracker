import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Workout } from '@/domain/workouts';
import { toWorkout } from '../converters/workout';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
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

    const syncKey = `workouts:${uid}`;

    const unsubscribe = onSnapshot(
      query(paths.workouts(uid), orderBy('createdAt', 'desc')),
      { includeMetadataChanges: true },
      (next) => {
        reportSync(syncKey, {
          pending: next.metadata.hasPendingWrites,
          fromCache: next.metadata.fromCache,
        });

        setSnapshot({
          uid,
          workouts: next.docs.map((document) => toWorkout(document.id, document.data())),
          isPending: false,
          hasPendingWrites: next.metadata.hasPendingWrites,
        });
      },
    );

    return () => {
      unsubscribe();
      releaseSync(syncKey);
    };
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
