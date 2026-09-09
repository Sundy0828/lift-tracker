import { onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { ExerciseStats } from '@/domain/overlay';
import { toExerciseStats } from '../converters/session';
import { paths } from '../paths';
import { useAuth } from './useAuth';

/**
 * Every exercise's stats document — the PR feed across all lifts.
 *
 * The feed is read straight off the tier-2 index rather than recomputed from
 * sessions, because `bestE1rm` / `bestSet` were already maxed into that
 * document at the moment the record was set. Recomputing would be a scan of
 * every session ever logged to arrive at the same numbers, and could disagree
 * with the toast that was shown at the time.
 *
 * One document per exercise you have ever performed, so the collection is
 * bounded by your own training rather than by the 800-entry catalog.
 */

export type RecordsState = {
  stats: readonly ExerciseStats[];
  isPending: boolean;
};

const PENDING: RecordsState = { stats: [], isPending: true };

export function useAllExerciseStats(): RecordsState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<(RecordsState & { uid: string }) | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(paths.exerciseStats(uid), (next) => {
      setSnapshot({
        uid,
        stats: next.docs.map((document) => toExerciseStats(document.id, document.data())),
        isPending: false,
      });
    });
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
