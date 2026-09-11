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
  /** Every unfinished session, newest first. */
  sessions: readonly Session[];
  /** The newest unfinished session, or null when there is none. */
  session: Session | null;
  isPending: boolean;
};

const ACTIVE_PENDING: ActiveSessionState = { sessions: [], session: null, isPending: true };

type ActiveSnapshot = ActiveSessionState & { uid: string };

/** Every session still in progress, newest first. */
export function useActiveSession(): ActiveSessionState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<ActiveSnapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(query(paths.sessions(uid), where('status', '==', 'active')), (next) => {
      const sessions = next.docs.map((document) => toSession(document.id, document.data()));
      sessions.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
      setSnapshot({ uid, sessions, session: sessions[0] ?? null, isPending: false });
    });
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return ACTIVE_PENDING;
  return snapshot;
}
