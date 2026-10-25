import { useSyncState } from '@lift/data/hooks/useSyncState';
import { formatSyncAge } from '@lift/data/sync';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Body, Card, Heading, Small } from '../ui';

/**
 * Where you go to ask "did my workout actually save?": the web's `SyncCard`.
 *
 * Honest about its limits: the tally covers the listeners open now, so it is
 * a status light, not an audit of Firestore's queue, and it never claims a
 * write is lost. "Offline" is Firestore's own view (every listener answering
 * from cache), as in the sync strip.
 */
export function SyncCard() {
  const { pending, offline, syncedAt } = useSyncState();
  const now = useTicker(pending || syncedAt !== null);

  return (
    <Card>
      <View style={styles.head}>
        <Heading>Sync</Heading>
        {pending ? (
          <Badge label="saved locally · will sync" />
        ) : (
          <Badge tone="success" label="up to date" />
        )}
      </View>
      <Body dimmed>
        {pending
          ? offline
            ? 'Changes are saved on this phone. They go up as soon as there is a connection — you can close the app in the meantime.'
            : 'Changes are saved on this phone and on their way to the server.'
          : syncedAt === null
            ? 'Nothing is waiting to sync.'
            : `Nothing is waiting to sync. Last write reached the server ${formatSyncAge(syncedAt, now)}.`}
      </Body>
      <Small>
        Every workout is written to this phone first, so logging never waits on a network and never
        fails for the lack of one.
      </Small>
    </Card>
  );
}

/** A clock that only runs while something on screen counts from it. */
function useTicker(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 15_000);
    return () => {
      clearInterval(id);
    };
  }, [running]);
  return now;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
