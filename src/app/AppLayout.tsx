import { Center, Loader, Text } from '@mantine/core';
import { Suspense } from 'react';
import { Outlet } from 'react-router';
import classes from './AppLayout.module.css';
import { BottomNav } from './BottomNav';
import { useOnline } from './useOnline';

/**
 * The offline note is a statement of fact, not a warning.
 *
 * Everything except the very first sign-in works offline by design (§2.8), so
 * this exists to explain a screen that will not load or a sync chip that will
 * not clear — never to suggest you should stop lifting. It is deliberately a
 * thin strip rather than an alert: it must not push the set grid down the page
 * mid-session.
 */
function OfflineStrip() {
  return (
    <div className={classes.offline} role="status">
      <Text size="xs">Offline — logging still works and syncs when you reconnect</Text>
    </div>
  );
}

export function AppLayout() {
  const online = useOnline();

  return (
    <div className={classes.shell}>
      {online ? null : <OfflineStrip />}
      <main className={classes.main}>
        <Suspense
          fallback={
            <Center h="50dvh">
              <Loader aria-label="Loading screen" />
            </Center>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}
