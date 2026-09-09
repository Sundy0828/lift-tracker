import { onSnapshot, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { CustomExercise } from '@/domain/exercises';
import { toCustomExercise } from '../converters/exercise';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';

export type CustomExercisesState = {
  exercises: readonly CustomExercise[];
  isPending: boolean;
  hasPendingWrites: boolean;
};

const PENDING: CustomExercisesState = { exercises: [], isPending: true, hasPendingWrites: false };

type Snapshot = CustomExercisesState & { uid: string };

/**
 * Live list of the user's custom exercises. There are at most a few dozen, so
 * the whole collection is held in memory and no pagination is needed.
 */
export function useCustomExercises(): CustomExercisesState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    const syncKey = `custom-exercises:${uid}`;

    const unsubscribe = onSnapshot(
      query(paths.customExercises(uid)),
      { includeMetadataChanges: true },
      (next) => {
        reportSync(syncKey, {
          pending: next.metadata.hasPendingWrites,
          fromCache: next.metadata.fromCache,
        });

        setSnapshot({
          uid,
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
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
