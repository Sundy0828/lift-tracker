import { useSyncExternalStore } from 'react';
import type { SyncState } from '../sync';
import { subscribeSync, SYNC_IDLE, syncSnapshot } from '../sync';

/**
 * The app-wide sync tally, for the chip in the shell.
 *
 * See `data/sync` for what it can and cannot see — in particular that it
 * reports on the listeners currently open, not on Firestore's whole queue.
 */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, syncSnapshot, () => SYNC_IDLE);
}
