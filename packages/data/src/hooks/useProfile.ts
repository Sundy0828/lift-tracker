import { onSnapshot } from '../sdk/firestore';
import { useCallback } from 'react';
import type { UserProfile } from '@lift/domain/types';
import { DEFAULT_PROFILE } from '@lift/domain/types';
import { parseProfile } from '../converters/profile';
import { ensureFriendCode } from '../mutations/friends';
import { initializeProfile } from '../mutations/profile';
import { paths } from '../paths';
import { releaseSync, reportSync } from '../sync';
import { useAuth } from './useAuth';
import { useSharedSubscription } from './useShared';

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

/**
 * Live profile for the signed-in user. Snapshot metadata is surfaced rather
 * than hidden so the UI can show sync state honestly instead of a spinner.
 *
 * One listener for the whole app (see `useShared`), keyed by uid, so a
 * different account reads as pending rather than briefly showing the previous
 * user's preferences, and every screen after the first reads it at once.
 */
export function useProfile(): ProfileState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const start = useCallback(
    (emit: (value: ProfileState) => void) => {
      if (uid === null) return () => undefined;
      // Seeding is driven off this listener rather than a separate read, so a
      // new account gets its `createdAt` without an extra round trip and
      // without a blind write that could clobber stored preferences.
      let seeded = false;
      const syncKey = `profile:${uid}`;

      const unsubscribe = onSnapshot(paths.user(uid), { includeMetadataChanges: true }, (next) => {
        reportSync(syncKey, {
          pending: next.metadata.hasPendingWrites,
          fromCache: next.metadata.fromCache,
        });

        const profile = parseProfile(next.data());
        emit({
          profile,
          isPending: false,
          hasPendingWrites: next.metadata.hasPendingWrites,
          fromCache: next.metadata.fromCache,
        });

        if (!next.exists() && !seeded) {
          seeded = true;
          void initializeProfile(uid);
        }

        // Only from a server snapshot: the cache can report no code while the
        // account already has one, and minting a second would strand the first
        // in a public collection nothing can list to find it again.
        if (!next.metadata.fromCache) {
          void ensureFriendCode(uid, profile.friendCode, profile.displayName);
        }
      });

      return () => {
        unsubscribe();
        releaseSync(syncKey);
      };
    },
    [uid],
  );

  return useSharedSubscription(uid === null ? null : `profile:${uid}`, start) ?? PENDING;
}
