import { onSnapshot, query, where } from '../sdk/firestore';
import { useCallback } from 'react';
import type { Session } from '@lift/domain/sessions';
import { toSession } from '../converters/session';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';
import { useSharedSubscription } from './useShared';

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

/**
 * One session, live. The active-session screen's single source of truth.
 *
 * Shared by id (see `useShared`), so coming back to a session from Today, or
 * from the notification, opens on the sets as they stand rather than a spinner.
 */
export function useSession(sessionId: string | null): SessionState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid === null || sessionId === null ? null : `session:${uid}/${sessionId}`;

  const start = useCallback(
    (emit: (value: SessionState) => void) => {
      if (uid === null || sessionId === null) return () => undefined;
      const syncKey = `session:${uid}/${sessionId}`;

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
          emit({
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
    },
    [uid, sessionId],
  );

  return useSharedSubscription(key, start) ?? PENDING;
}

export type ActiveSessionState = {
  /** Every unfinished session, newest first. */
  sessions: readonly Session[];
  /** The newest unfinished session, or null when there is none. */
  session: Session | null;
  isPending: boolean;
};

const ACTIVE_PENDING: ActiveSessionState = { sessions: [], session: null, isPending: true };

/** Every session still in progress, newest first. One listener for the whole app. */
export function useActiveSession(): ActiveSessionState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const start = useCallback(
    (emit: (value: ActiveSessionState) => void) => {
      if (uid === null) return () => undefined;
      return onSnapshot(query(paths.sessions(uid), where('status', '==', 'active')), (next) => {
        const sessions = next.docs.map((document) => toSession(document.id, document.data()));
        sessions.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
        emit({ sessions, session: sessions[0] ?? null, isPending: false });
      });
    },
    [uid],
  );

  return (
    useSharedSubscription(uid === null ? null : `active-sessions:${uid}`, start) ?? ACTIVE_PENDING
  );
}
