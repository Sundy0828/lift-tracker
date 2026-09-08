import { documentId, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExerciseStats, WorkoutStats } from '@/domain/overlay';
import { toExerciseStats, toWorkoutStats } from '../converters/session';
import { paths } from '../paths';
import { useAuth } from './useAuth';

/**
 * The two overlay tiers, read for one session (§2.6).
 *
 * Tier 1 is **one document** covering every exercise in the workout, which is
 * why opening a session populates the whole overlay without a query. Tier 2 is
 * the per-exercise fallback, and the same subscription supplies the previous
 * `bestE1rm` that PR detection maxes into on completion — so completing a
 * session needs no read of its own.
 *
 * Both come from listeners rather than one-shot reads, so the overlay is
 * served from the local cache offline and repairs itself when a write from
 * another device lands.
 */

export type WorkoutStatsState = {
  stats: WorkoutStats | null;
  isPending: boolean;
};

const WORKOUT_PENDING: WorkoutStatsState = { stats: null, isPending: true };

type WorkoutSnapshot = WorkoutStatsState & { key: string };

/** Tier 1: the last performance of every exercise within one workout. */
export function useWorkoutStats(workoutId: string | null): WorkoutStatsState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid === null || workoutId === null ? null : `${uid}/${workoutId}`;

  const [snapshot, setSnapshot] = useState<WorkoutSnapshot | null>(null);

  useEffect(() => {
    if (uid === null || workoutId === null || key === null) return;

    return onSnapshot(paths.workoutStat(uid, workoutId), (next) => {
      setSnapshot({
        key,
        stats: next.exists() ? toWorkoutStats(next.id, next.data()) : null,
        isPending: false,
      });
    });
  }, [uid, workoutId, key]);

  // An ad-hoc session has no workout, so there is nothing to wait for.
  if (workoutId === null) return { stats: null, isPending: false };
  if (key === null || snapshot?.key !== key) return WORKOUT_PENDING;
  return snapshot;
}

export type ExerciseStatsState = {
  /** Keyed by exercise id. Absent means no history anywhere — the NEW badge. */
  byExercise: ReadonlyMap<string, ExerciseStats>;
  /** Reads the map, in the shape the pure stats builder wants. */
  lookup: (exerciseId: string) => ExerciseStats | null;
  isPending: boolean;
};

/** Firestore's cap on values in an `in` filter. */
const CHUNK = 30;

function chunk(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += CHUNK) {
    chunks.push(ids.slice(index, index + CHUNK));
  }
  return chunks;
}

const EMPTY: ReadonlyMap<string, ExerciseStats> = new Map();

/**
 * Tier 2: the last performance of each exercise *anywhere*, plus its PR.
 *
 * Fetched by document id in one query per thirty exercises rather than one
 * listener each — a fifteen-exercise workout is a single query, and the ids
 * are stable so it does not re-subscribe as you log.
 */
export function useExerciseStats(exerciseIds: readonly string[]): ExerciseStatsState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // Sorted and de-duplicated, then compared as a string: the same workout
  // renders many times per session and must not re-subscribe each time.
  const ids = useMemo(() => [...new Set(exerciseIds)].sort(), [exerciseIds]);
  const idKey = ids.join(',');
  const key = uid === null ? null : `${uid}/${idKey}`;

  const [snapshot, setSnapshot] = useState<{
    key: string;
    byExercise: ReadonlyMap<string, ExerciseStats>;
  } | null>(null);

  useEffect(() => {
    if (uid === null || key === null) return;

    // No exercises means nothing to subscribe to. The empty result is derived
    // below rather than written here, so the effect only ever sets state from
    // a subscription callback.
    const groups = chunk(idKey === '' ? [] : idKey.split(','));
    if (groups.length === 0) return;

    // One map per chunk, merged on every snapshot, so a late-arriving chunk
    // never drops the results of one that already resolved.
    const results = groups.map(() => new Map<string, ExerciseStats>());

    const unsubscribes = groups.map((group, index) =>
      onSnapshot(query(paths.exerciseStats(uid), where(documentId(), 'in', group)), (next) => {
        const found = new Map<string, ExerciseStats>();
        for (const document of next.docs) {
          found.set(document.id, toExerciseStats(document.id, document.data()));
        }
        results[index] = found;
        setSnapshot({ key, byExercise: new Map(results.flatMap((part) => [...part])) });
      }),
    );

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [uid, key, idKey]);

  const hasIds = ids.length > 0;
  const byExercise = hasIds && snapshot?.key === key ? snapshot.byExercise : EMPTY;

  const lookup = useCallback(
    (exerciseId: string): ExerciseStats | null => byExercise.get(exerciseId) ?? null,
    [byExercise],
  );

  return { byExercise, lookup, isPending: hasIds && snapshot?.key !== key };
}
