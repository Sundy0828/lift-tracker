import { getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { SharedWorkout } from '@/domain/sharing';
import { toSharedWorkout } from '../converters/shared';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';

export type SharedWorkoutState = {
  shared: SharedWorkout | null;
  isPending: boolean;
  /** No such share, or the rules refused it — indistinguishable, by design. */
  notFound: boolean;
  /** The document exists and says it is revoked. */
  revoked: boolean;
};

const PENDING: SharedWorkoutState = {
  shared: null,
  isPending: true,
  notFound: false,
  revoked: false,
};

/**
 * One share, read once.
 *
 * A **one-shot `getDoc`, not a listener**, and that is the deliberate part: a
 * share is somebody else's immutable snapshot, so there is nothing to watch.
 * Subscribing would also keep a listener open on a public document for as long
 * as the tab lives, and the only update it could ever deliver is a revocation
 * — which is not something to yank out from under someone mid-read.
 *
 * Reading is allowed signed-out, so this hook does not wait on auth. That is
 * the one place in the app where that is true (§2.9).
 */
export function useSharedWorkout(shareId: string | null): SharedWorkoutState {
  const [state, setState] = useState<{ key: string } & SharedWorkoutState>({
    key: '',
    ...PENDING,
  });

  useEffect(() => {
    if (shareId === null || shareId === '') return;

    let cancelled = false;

    getDoc(paths.sharedWorkout(shareId)).then(
      (snapshot) => {
        if (cancelled) return;
        const shared = snapshot.exists() ? toSharedWorkout(snapshot.id, snapshot.data()) : null;
        setState({
          key: shareId,
          shared: shared !== null && !shared.revoked ? shared : null,
          isPending: false,
          notFound: shared === null,
          revoked: shared?.revoked ?? false,
        });
      },
      () => {
        // A rules refusal and a missing document are the same answer here, and
        // saying which would leak whether a share id exists.
        if (cancelled) return;
        setState({ key: shareId, shared: null, isPending: false, notFound: true, revoked: false });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [shareId]);

  if (shareId === null || shareId === '' || state.key !== shareId) return PENDING;
  return state;
}

export type SharesState = {
  shares: readonly SharedWorkout[];
  isPending: boolean;
};

const SHARES_PENDING: SharesState = { shares: [], isPending: true };

type Snapshot = SharesState & { uid: string };

/**
 * Every share the signed-in user owns, live — including revoked ones, which
 * they still need to see to know what they have turned off.
 *
 * One equality filter on `ownerUid`, which runs on Firestore's automatic
 * single-field index. It is also what makes the query legal: the rules only
 * allow *listing* shares you own, so a query that did not constrain the owner
 * would be refused outright rather than silently filtered.
 */
export function useShares(): SharesState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    const syncKey = `shares:${uid}`;

    const unsubscribe = onSnapshot(
      query(paths.sharedWorkouts(), where('ownerUid', '==', uid)),
      { includeMetadataChanges: true },
      (next) => {
        reportSync(syncKey, {
          pending: next.metadata.hasPendingWrites,
          fromCache: next.metadata.fromCache,
        });

        const shares: SharedWorkout[] = [];
        for (const document of next.docs) {
          const parsed = toSharedWorkout(document.id, document.data());
          if (parsed !== null) shares.push(parsed);
        }
        shares.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        setSnapshot({ uid, shares, isPending: false });
      },
      () => {
        // An empty inventory is the honest fallback: nothing here gates any
        // action, and a share panel that cannot list is still able to publish.
        setSnapshot({ uid, shares: [], isPending: false });
      },
    );

    return () => {
      unsubscribe();
      releaseSync(syncKey);
    };
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return SHARES_PENDING;
  return snapshot;
}
