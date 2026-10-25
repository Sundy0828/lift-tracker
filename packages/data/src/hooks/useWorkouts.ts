import { onSnapshot, orderBy, query } from '../sdk/firestore';
import { useCallback } from 'react';
import type { Workout } from '@lift/domain/workouts';
import { toWorkout } from '../converters/workout';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';
import { useSharedSubscription } from './useShared';

export type WorkoutsState = {
  workouts: readonly Workout[];
  isPending: boolean;
  hasPendingWrites: boolean;
};

const PENDING: WorkoutsState = { workouts: [], isPending: true, hasPendingWrites: false };

/**
 * Every workout the user owns, newest first. One listener for the whole app
 * (see `useShared`): Today, Workouts and the plan all read the same one.
 */
export function useWorkouts(): WorkoutsState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const start = useCallback(
    (emit: (value: WorkoutsState) => void) => {
      if (uid === null) return () => undefined;
      const syncKey = `workouts:${uid}`;

      const unsubscribe = onSnapshot(
        query(paths.workouts(uid), orderBy('createdAt', 'desc')),
        { includeMetadataChanges: true },
        (next) => {
          reportSync(syncKey, {
            pending: next.metadata.hasPendingWrites,
            fromCache: next.metadata.fromCache,
          });
          emit({
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
    },
    [uid],
  );

  return useSharedSubscription(uid === null ? null : `workouts:${uid}`, start) ?? PENDING;
}
