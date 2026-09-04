import { onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Plan, PlanVersion } from '@/domain/plans';
import { toPlan, toPlanVersion } from '../converters/plan';
import { paths } from '../paths';
import { useAuth } from './useAuth';

export type PlanState = {
  plan: Plan | null;
  /** Immutable snapshots, newest first. */
  versions: readonly PlanVersion[];
  isPending: boolean;
  hasPendingWrites: boolean;
  /** True when the document does not exist (deleted, or a bad link). */
  notFound: boolean;
};

const PENDING: PlanState = {
  plan: null,
  versions: [],
  isPending: true,
  hasPendingWrites: false,
  notFound: false,
};

type Snapshot = {
  key: string;
  plan: Plan | null;
  hasPendingWrites: boolean;
  notFound: boolean;
};

/**
 * One plan's working copy plus its version history. Two listeners rather than
 * one, because a version list changes only on publish while the working copy
 * changes on every keystroke-level edit.
 */
export function usePlan(planId: string | null): PlanState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid === null || planId === null ? null : `${uid}/${planId}`;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [versions, setVersions] = useState<{ key: string; list: PlanVersion[] } | null>(null);

  useEffect(() => {
    if (uid === null || planId === null || key === null) return;

    return onSnapshot(paths.plan(uid, planId), { includeMetadataChanges: true }, (next) => {
      setSnapshot({
        key,
        plan: next.exists() ? toPlan(next.id, next.data()) : null,
        hasPendingWrites: next.metadata.hasPendingWrites,
        notFound: !next.exists() && !next.metadata.fromCache,
      });
    });
  }, [uid, planId, key]);

  useEffect(() => {
    if (uid === null || planId === null || key === null) return;

    return onSnapshot(
      query(paths.planVersions(uid, planId), orderBy('versionNumber', 'desc')),
      (next) => {
        setVersions({
          key,
          list: next.docs.map((document) => toPlanVersion(document.id, document.data())),
        });
      },
    );
  }, [uid, planId, key]);

  if (key === null || snapshot?.key !== key) return PENDING;

  return {
    plan: snapshot.plan,
    versions: versions?.key === key ? versions.list : [],
    isPending: false,
    hasPendingWrites: snapshot.hasPendingWrites,
    notFound: snapshot.notFound,
  };
}
