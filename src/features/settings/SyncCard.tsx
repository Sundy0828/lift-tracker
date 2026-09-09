import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useSyncState } from '@/data/hooks/useSyncState';
import { formatSyncAge } from '@/data/sync';
import { useOnline } from '@/app/useOnline';

/**
 * Where you go to ask "did my workout actually save?".
 *
 * The strip in the shell answers that in passing and only while something is
 * outstanding. This is the place that answers it on demand, including the
 * boring case — nothing waiting — which is the answer people actually come
 * looking for after a session in a basement.
 *
 * It is honest about its own limits (see `data/sync`): the tally covers the
 * listeners this screen has open, so it is a status light, not an audit of
 * Firestore's queue. It never claims a write is lost, because it cannot know
 * that — the cache keeps queued writes across restarts and flushes them on its
 * own schedule.
 */
export function SyncCard() {
  const online = useOnline();
  const { pending, syncedAt } = useSyncState();
  const now = useTicker(pending || syncedAt !== null);

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={600}>Sync</Text>
          {pending ? (
            <Badge variant="light" color="gray" size="sm">
              saved locally · will sync
            </Badge>
          ) : (
            <Badge variant="light" color="teal" size="sm">
              up to date
            </Badge>
          )}
        </Group>

        <Text size="sm" c="dimmed">
          {pending
            ? online
              ? 'Changes are saved on this device and on their way to the server.'
              : 'Changes are saved on this device. They go up as soon as there is a connection — you can close the app in the meantime.'
            : syncedAt === null
              ? 'Nothing is waiting to sync.'
              : `Nothing is waiting to sync. Last write reached the server ${formatSyncAge(syncedAt, now)}.`}
        </Text>

        <Text size="xs" c="dimmed">
          Every workout is written to this device first, so logging never waits on a network and
          never fails for the lack of one.
        </Text>
      </Stack>
    </Card>
  );
}

/**
 * A clock that only runs when something on screen depends on it.
 *
 * The age is coarse (`formatSyncAge`), so a slow tick is enough to keep it
 * from going stale while this screen is open, and it stops entirely once there
 * is nothing to count from.
 */
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
