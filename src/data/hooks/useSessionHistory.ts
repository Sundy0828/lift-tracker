import { limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@/domain/sessions';
import { toSession } from '../converters/session';
import { paths } from '../paths';
import { useAuth } from './useAuth';

/**
 * The history timeline: sessions newest-first by the day they were performed.
 *
 * **Ordered on `performedOn` alone**, with the still-running session filtered
 * out in memory. A `where('status', ...)` clause would need a composite index
 * for a filter that removes at most one document — there is only ever one
 * active session — and the page is over-fetched by one to absorb it.
 *
 * A listener rather than a one-shot read, so the timeline is served from the
 * local cache offline and repairs itself when a session logged on another
 * device lands.
 */

export type SessionHistoryState = {
  /** Newest first, ties broken by start time. */
  sessions: readonly Session[];
  isPending: boolean;
  /** True when the server had more than the current page. */
  hasMore: boolean;
  loadMore: () => void;
};

export const HISTORY_PAGE_SIZE = 40;

export function useSessionHistory(pageSize: number = HISTORY_PAGE_SIZE): SessionHistoryState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [size, setSize] = useState(pageSize);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    sessions: Session[];
    hasMore: boolean;
  } | null>(null);

  const key = uid === null ? null : `${uid}/${String(size)}`;

  useEffect(() => {
    if (uid === null || key === null) return;

    // One past the page, purely to learn whether a "load more" is worth
    // offering; the extra document is dropped before it is rendered.
    return onSnapshot(
      query(paths.sessions(uid), orderBy('performedOn', 'desc'), limit(size + 1)),
      (next) => {
        const all = next.docs.map((document) => toSession(document.id, document.data()));
        const done = all.filter((session) => session.status !== 'active');
        done.sort(
          (a, b) =>
            b.performedOn.localeCompare(a.performedOn) ||
            (b.startedAt ?? '').localeCompare(a.startedAt ?? ''),
        );
        setSnapshot({ key, sessions: done.slice(0, size), hasMore: all.length > size });
      },
    );
  }, [uid, key, size]);

  const loadMore = useCallback(() => {
    setSize((current) => current + pageSize);
  }, [pageSize]);

  if (key === null || snapshot?.key !== key) {
    // A page already loaded stays on screen while a longer one resolves, so
    // "load more" extends the list instead of blanking it.
    const previous = snapshot?.sessions ?? [];
    return { sessions: previous, isPending: previous.length === 0, hasMore: false, loadMore };
  }

  return { ...snapshot, isPending: false, loadMore };
}
