import { onSnapshot, query } from '../sdk/firestore';
import { useCallback } from 'react';
import type { CustomExercise } from '@lift/domain/exercises';
import { toCustomExercise } from '../converters/exercise';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';
import { useSharedSubscription } from './useShared';

export type CustomExercisesState = {
  exercises: readonly CustomExercise[];
  isPending: boolean;
  hasPendingWrites: boolean;
};

const PENDING: CustomExercisesState = { exercises: [], isPending: true, hasPendingWrites: false };

/**
 * Live list of the user's custom exercises. There are at most a few dozen, so
 * the whole collection is held in memory and no pagination is needed.
 *
 * One listener for the whole app (see `useShared`). That also makes the array
 * the same object for every reader, which is what lets the exercise library
 * build its search index once rather than once per screen.
 */
export function useCustomExercises(): CustomExercisesState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const start = useCallback(
    (emit: (value: CustomExercisesState) => void) => {
      if (uid === null) return () => undefined;
      const syncKey = `custom-exercises:${uid}`;

      const unsubscribe = onSnapshot(
        query(paths.customExercises(uid)),
        { includeMetadataChanges: true },
        (next) => {
          reportSync(syncKey, {
            pending: next.metadata.hasPendingWrites,
            fromCache: next.metadata.fromCache,
          });
          emit({
            exercises: next.docs.map((document) => toCustomExercise(document.id, document.data())),
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

  return useSharedSubscription(uid === null ? null : `custom-exercises:${uid}`, start) ?? PENDING;
}
