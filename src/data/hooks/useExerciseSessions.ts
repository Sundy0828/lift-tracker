import { FirebaseError } from 'firebase/app';
import { limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Session } from '@/domain/sessions';
import { toSession } from '../converters/session';
import { paths } from '../paths';
import { useAuth } from './useAuth';

/**
 * Every session that included one exercise — the source of the per-exercise
 * trend line and PR list.
 *
 * This is the one place the app queries history rather than reading a
 * denormalised index, and §2.6 is explicit that it must stay off the logging
 * path: the hook is only mounted by the exercise-history route, which is
 * reached by tapping through from a session.
 *
 * The query is `array-contains` on the session's denormalised `exerciseIds`,
 * which needs the composite index in `firestore.indexes.json`. Sessions
 * written before that field existed simply do not match — they are missing
 * from a trend line, not corrupting it.
 */

export type ExerciseSessionsState = {
  /** Every matching session, unsorted; the domain layer orders them. */
  sessions: readonly Session[];
  isPending: boolean;
  /** True when the cap was reached and older performances exist. */
  isTruncated: boolean;
  /**
   * Why the query failed, in words a person can act on, or null.
   *
   * A listener that errors never calls back again, so without this the screen
   * would sit on its loading skeleton for ever — which is exactly how a
   * missing index presented before this existed.
   */
  error: string | null;
};

/**
 * Two years of a lift done weekly, which is well past the point where a
 * sparkline says anything a longer one would not.
 */
export const EXERCISE_HISTORY_LIMIT = 120;

const PENDING: ExerciseSessionsState = {
  sessions: [],
  isPending: true,
  isTruncated: false,
  error: null,
};

function describe(error: unknown): string {
  if (error instanceof FirebaseError && error.code === 'firestore/failed-precondition') {
    // The one failure with a specific, actionable cause: the composite index
    // this query needs has not been deployed to the project.
    return 'This lift’s history needs a Firestore index that has not been deployed yet. Run `firebase deploy --only firestore:indexes`.';
  }
  if (error instanceof FirebaseError && error.code === 'firestore/permission-denied') {
    return 'You do not have access to this history.';
  }
  return error instanceof Error ? error.message : 'Could not load this history.';
}

export function useExerciseSessions(
  exerciseId: string | null,
  max: number = EXERCISE_HISTORY_LIMIT,
): ExerciseSessionsState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid === null || exerciseId === null ? null : `${uid}/${exerciseId}/${String(max)}`;

  const [snapshot, setSnapshot] = useState<(ExerciseSessionsState & { key: string }) | null>(null);

  useEffect(() => {
    if (uid === null || exerciseId === null || key === null) return;

    return onSnapshot(
      query(
        paths.sessions(uid),
        where('exerciseIds', 'array-contains', exerciseId),
        orderBy('performedOn', 'desc'),
        limit(max + 1),
      ),
      (next) => {
        const all = next.docs
          .map((document) => toSession(document.id, document.data()))
          // The session you are in the middle of has no history to add yet.
          .filter((session) => session.status !== 'active');
        setSnapshot({
          key,
          sessions: all.slice(0, max),
          isPending: false,
          isTruncated: all.length > max,
          error: null,
        });
      },
      (error) => {
        setSnapshot({
          key,
          sessions: [],
          isPending: false,
          isTruncated: false,
          error: describe(error),
        });
      },
    );
  }, [uid, exerciseId, key, max]);

  if (key === null || snapshot?.key !== key) return PENDING;
  return snapshot;
}
