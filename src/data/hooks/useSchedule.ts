import { onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Schedule } from '@/domain/schedule';
import { EMPTY_SCHEDULE, parseSchedule } from '@/domain/schedule';
import { paths } from '../paths';
import { useAuth } from './useAuth';

export type ScheduleState = {
  schedule: Schedule;
  /** True until the first snapshot arrives, from cache or server. */
  isPending: boolean;
};

const PENDING: ScheduleState = { schedule: EMPTY_SCHEDULE, isPending: true };

type Snapshot = ScheduleState & { uid: string };

/**
 * The weekly schedule, live.
 *
 * One document, so Today costs one extra read and renders from the local cache
 * offline. An account that has never made a schedule has no document at all,
 * which parses to an empty week rather than an error.
 */
export function useSchedule(): ScheduleState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(paths.schedule(uid), (next) => {
      setSnapshot({ uid, schedule: parseSchedule(next.data()), isPending: false });
    });
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
