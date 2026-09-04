import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Plan } from '@/domain/plans';
import { toPlan } from '../converters/plan';
import { paths } from '../paths';
import { useAuth } from './useAuth';

export type PlansState = {
  plans: readonly Plan[];
  isPending: boolean;
  hasPendingWrites: boolean;
};

const PENDING: PlansState = { plans: [], isPending: true, hasPendingWrites: false };

type Snapshot = PlansState & { uid: string };

/** Every plan the user owns, newest first. */
export function usePlans(): PlansState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(
      query(paths.plans(uid), orderBy('createdAt', 'desc')),
      { includeMetadataChanges: true },
      (next) => {
        setSnapshot({
          uid,
          plans: next.docs.map((document) => toPlan(document.id, document.data())),
          isPending: false,
          hasPendingWrites: next.metadata.hasPendingWrites,
        });
      },
    );
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
