import { onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/domain/types';
import { DEFAULT_PROFILE } from '@/domain/types';
import { parseProfile } from '../converters/profile';
import { initializeProfile } from '../mutations/profile';
import { paths } from '../paths';
import { useAuth } from './useAuth';

export type ProfileState = {
  profile: UserProfile;
  /** True until the first snapshot arrives (cache or server). */
  isPending: boolean;
  /** A local edit that has not reached the server yet. */
  hasPendingWrites: boolean;
  /** The snapshot came from the local cache rather than the server. */
  fromCache: boolean;
};

const PENDING: ProfileState = {
  profile: DEFAULT_PROFILE,
  isPending: true,
  hasPendingWrites: false,
  fromCache: false,
};

/** The snapshot state, tagged with the uid it belongs to. */
type Snapshot = ProfileState & { uid: string };

/**
 * Live profile for the signed-in user. Snapshot metadata is surfaced rather
 * than hidden so the UI can show sync state honestly instead of a spinner.
 *
 * The uid is stored alongside the data and checked on read, so signing into a
 * different account reports `isPending` rather than briefly showing the
 * previous user's preferences — and no state is reset from inside the effect.
 */
export function useProfile(): ProfileState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (uid === null) return;

    // Seeding is driven off this listener rather than a separate read, so a
    // new account gets its `createdAt` without an extra round trip and
    // without a blind write that could clobber stored preferences.
    let seeded = false;

    return onSnapshot(paths.user(uid), { includeMetadataChanges: true }, (next) => {
      setSnapshot({
        uid,
        profile: parseProfile(next.data()),
        isPending: false,
        hasPendingWrites: next.metadata.hasPendingWrites,
        fromCache: next.metadata.fromCache,
      });

      if (!next.exists() && !seeded) {
        seeded = true;
        void initializeProfile(uid);
      }
    });
  }, [uid]);

  if (uid === null || snapshot?.uid !== uid) return PENDING;
  return snapshot;
}
