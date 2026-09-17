import { onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { DaySummary } from '@/domain/calendar';
import { parseDayIndex } from '@/domain/dayIndex';
import { paths } from '../paths';
import { useAuth } from './useAuth';

export type DayIndexState = {
  /** One entry per finished session, in no particular order. */
  summaries: readonly DaySummary[];
  isPending: boolean;
};

const PENDING: DayIndexState = { summaries: [], isPending: true };

type Snapshot = DayIndexState & { uid: string };

/**
 * The calendar's data: one small document a year (see `domain/dayIndex`).
 *
 * A **listener**, unlike the whole-history read it replaces. There are only a
 * handful of documents and they are tiny, so keeping them live costs almost
 * nothing — and it means finishing a session updates the calendar behind you
 * rather than on the next visit.
 */
export function useDayIndex(): DayIndexState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    return onSnapshot(
      paths.dayIndexes(uid),
      (next) => {
        const summaries = next.docs.flatMap((document) => parseDayIndex(document.data()));
        setSnapshot({ uid, summaries, isPending: false });
      },
      () => {
        // An unreadable index is an empty one: the sessions are the record, and
        // the caller falls back to reading them.
        setSnapshot({ uid, summaries: [], isPending: false });
      },
    );
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
