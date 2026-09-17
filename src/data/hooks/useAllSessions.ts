import { getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Session } from '@/domain/sessions';
import { toSession } from '../converters/session';
import { paths } from '../paths';
import { useAuth } from './useAuth';

/**
 * The whole history, for an export.
 *
 * **A one-shot read of up to `WINDOW` sessions, not a listener**, and gated on
 * `enabled` so it only runs when a button is pressed. An export is a full dump
 * — every set of every session — so there is nothing to summarise and no index
 * to read instead. The calendar used to share this and no longer does: it runs
 * off the day index, precisely because drawing squares should not cost a
 * megabyte (see `domain/dayIndex`).
 *
 * The window is a real limit, not a formality, so `complete` reports whether
 * the read reached the end — a file that claims to be everything has to be
 * able to say when it is not.
 *
 * There is no refresh: the caller unmounts when Settings is left, so coming
 * back re-reads.
 */

/** About four years at five sessions a week. */
export const WINDOW = 1000;

export type AllSessionsState = {
  /** Newest first, ties broken by start time. */
  sessions: readonly Session[];
  isPending: boolean;
  /** False when the window filled, so older sessions are missing. */
  complete: boolean;
  error: string | null;
};

type Snapshot = {
  key: string;
  sessions: Session[];
  complete: boolean;
  error: string | null;
};

export function useAllSessions(enabled = true): AllSessionsState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const key = uid;

  useEffect(() => {
    if (!enabled || uid === null || key === null) return;

    let cancelled = false;

    // One past the window, purely to learn whether anything was cut off.
    getDocs(query(paths.sessions(uid), orderBy('performedOn', 'desc'), limit(WINDOW + 1))).then(
      (result) => {
        if (cancelled) return;
        const all = result.docs.map((document) => toSession(document.id, document.data()));
        const done = all.filter((session) => session.status !== 'active');
        done.sort(
          (a, b) =>
            b.performedOn.localeCompare(a.performedOn) ||
            (b.startedAt ?? '').localeCompare(a.startedAt ?? ''),
        );
        setSnapshot({
          key,
          sessions: done.slice(0, WINDOW),
          complete: all.length <= WINDOW,
          error: null,
        });
      },
      () => {
        if (cancelled) return;
        setSnapshot({
          key,
          sessions: [],
          complete: true,
          error: 'History could not be read. Try again once you are back online.',
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [enabled, uid, key]);

  if (!enabled || key === null || snapshot?.key !== key) {
    return { sessions: [], isPending: enabled, complete: true, error: null };
  }

  return { ...snapshot, isPending: false };
}
