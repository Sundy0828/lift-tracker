import { onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Session } from '@/domain/sessions';
import { toSession } from '../converters/session';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';

export type SessionState = {
  session: Session | null;
  isPending: boolean;
  hasPendingWrites: boolean;
  /** True when the document does not exist on the server (bad link, deleted). */
  notFound: boolean;
};

const PENDING: SessionState = {
  session: null,
  isPending: true,
  hasPendingWrites: false,
  notFound: false,
};

type Snapshot = SessionState & { key: string };

/** One session, live. The active-session screen's single source of truth. */
export function useSession(sessionId: string | null): SessionState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid === null || sessionId === null ? null : `${uid}/${sessionId}`;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null || sessionId === null || key === null) return;

    const syncKey = `session:${key}`;

    const unsubscribe = onSnapshot(
      paths.session(uid, sessionId),
      { includeMetadataChanges: true },
      (next) => {
        // The session document is the whole logged workout (§2.8), so this is
        // the reading the chip is really about: every set typed offline is a
        // pending write on this one document.
        reportSync(syncKey, {
          pending: next.metadata.hasPendingWrites,
          fromCache: next.metadata.fromCache,
        });

        setSnapshot({
          key,
          session: next.exists() ? toSession(next.id, next.data()) : null,
          isPending: false,
          hasPendingWrites: next.metadata.hasPendingWrites,
          // A miss from the cache alone is not a miss: a session started on
          // another device is absent locally until the first server snapshot.
          notFound: !next.exists() && !next.metadata.fromCache,
        });
      },
    );

    return () => {
      unsubscribe();
      releaseSync(syncKey);
    };
  }, [uid, sessionId, key]);

  if (key === null || snapshot?.key !== key) return PENDING;
  return snapshot;
}

export type ActiveSessionState = {
  session: Session | null;
  isPending: boolean;
  /**
   * Active sessions *besides* the one returned. Normally zero; above zero
   * means an earlier one was never finished or discarded, and saying so is
   * better than resuming the newest and letting the rest surface one at a
   * time over the following weeks.
   */
  strandedCount: number;
};

const ACTIVE_PENDING: ActiveSessionState = { session: null, isPending: true, strandedCount: 0 };

type ActiveSnapshot = ActiveSessionState & { uid: string };

/**
 * The session still in progress, if there is one.
 *
 * A single equality filter, sorted in memory, so it runs on Firestore's
 * automatic single-field index — adding `orderBy('startedAt')` would need a
 * composite index for a list that is almost always one document long.
 *
 * There should only ever be one, but the newest wins if a crash left two
 * behind — and `strandedCount` reports the others so Today can offer to clear
 * them rather than hiding them.
 */
export function useActiveSession(): ActiveSessionState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<ActiveSnapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(query(paths.sessions(uid), where('status', '==', 'active')), (next) => {
      const sessions = next.docs.map((document) => toSession(document.id, document.data()));
      sessions.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
      setSnapshot({
        uid,
        session: sessions[0] ?? null,
        isPending: false,
        strandedCount: Math.max(0, sessions.length - 1),
      });
    });
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return ACTIVE_PENDING;
  return snapshot;
}
