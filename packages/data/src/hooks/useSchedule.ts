import { onSnapshot } from '../sdk/firestore';
import { useCallback } from 'react';
import type { Schedule } from '@lift/domain/schedule';
import { EMPTY_SCHEDULE, parseSchedule } from '@lift/domain/schedule';
import { paths } from '../paths';
import { useAuth } from './useAuth';
import { useSharedSubscription } from './useShared';

export type ScheduleState = {
  schedule: Schedule;
  /** True until the first snapshot arrives, from cache or server. */
  isPending: boolean;
};

const PENDING: ScheduleState = { schedule: EMPTY_SCHEDULE, isPending: true };

/**
 * The weekly schedule, live.
 *
 * One document, so Today costs one extra read and renders from the local cache
 * offline. An account that has never made a schedule has no document at all,
 * which parses to an empty week rather than an error. One listener for the
 * whole app (see `useShared`).
 */
export function useSchedule(): ScheduleState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const start = useCallback(
    (emit: (value: ScheduleState) => void) => {
      if (uid === null) return () => undefined;
      return onSnapshot(paths.schedule(uid), (next) => {
        emit({ schedule: parseSchedule(next.data()), isPending: false });
      });
    },
    [uid],
  );

  return useSharedSubscription(uid === null ? null : `schedule:${uid}`, start) ?? PENDING;
}
