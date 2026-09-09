import { Text } from '@mantine/core';
import { useSyncState } from '@/data/hooks/useSyncState';
import classes from './AppLayout.module.css';
import { useOnline } from './useOnline';

/**
 * One strip for both halves of "is my logging safe?".
 *
 * They are one line rather than two because they are one question. Offline
 * explains why a screen will not load; pending writes explain what is waiting.
 * Stacking two banners would answer it twice and push the set grid down the
 * page mid-session, which is the one thing this must not do (§2.8).
 *
 * Every message is a statement of fact, never a warning and never an
 * instruction to stop lifting. A cleared queue says nothing at all: a strip
 * that is always there stops being read, and "synced" is the normal state, not
 * news. The last-synced *time* lives in Settings, where you go to look for it.
 */
export function SyncStrip() {
  const online = useOnline();
  const { pending } = useSyncState();

  if (online && !pending) return null;

  const message = !online
    ? pending
      ? 'Offline — your sets are saved on this device and will sync when you reconnect'
      : 'Offline — logging still works and syncs when you reconnect'
    : 'Saved on this device — syncing now';

  return (
    <div className={online ? classes.syncing : classes.offline} role="status">
      <Text size="xs">{message}</Text>
    </div>
  );
}
