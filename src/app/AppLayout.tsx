import { Center, Loader } from '@mantine/core';
import { Suspense } from 'react';
import { Outlet } from 'react-router';
import classes from './AppLayout.module.css';
import { BottomNav } from './BottomNav';
import { InstallPrompt } from './InstallPrompt';
import { SyncStrip } from './SyncStrip';

export function AppLayout() {
  return (
    <div className={classes.shell}>
      <SyncStrip />
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
      <InstallPrompt />
      <BottomNav />
    </div>
  );
}
