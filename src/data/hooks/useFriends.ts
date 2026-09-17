import { onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { FriendEdge } from '@/domain/friends';
import { parseFriendEdge } from '@/domain/friends';
import { paths } from '../paths';
import { useAuth } from './useAuth';

export type FriendEdgesState = {
  /** Requests in, requests out and friendships, in one list. */
  edges: readonly FriendEdge[];
  isPending: boolean;
};

const PENDING: FriendEdgesState = { edges: [], isPending: true };

type Snapshot = FriendEdgesState & { uid: string };

/**
 * Every connection this account is part of, at any stage.
 *
 * **One query**, on `array-contains` over the sorted uid pair — which is also
 * what makes it legal: the rules allow reading an edge only to the two
 * accounts it names, so a query that did not constrain the pair would be
 * refused rather than quietly filtered.
 *
 * Pending and accepted come back together because they are the same document;
 * `domain/friends` splits them for the screens that care.
 */
export function useFriendEdges(): FriendEdgesState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(
      query(paths.friendEdges(), where('uids', 'array-contains', uid)),
      (next) => {
        const edges: FriendEdge[] = [];
        for (const document of next.docs) {
          const edge = parseFriendEdge(document.id, document.data());
          if (edge !== null) edges.push(edge);
        }
        setSnapshot({ uid, edges, isPending: false });
      },
      () => {
        setSnapshot({ uid, edges: [], isPending: false });
      },
    );
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
