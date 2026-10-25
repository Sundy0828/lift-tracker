import { Center, Loader } from '@mantine/core';
import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router';
import classes from './AppLayout.module.css';
import { BottomNav } from './BottomNav';
import { InstallPrompt } from './InstallPrompt';
import { SyncStrip } from './SyncStrip';

/**
 * Lazy: it reads the profile through Firestore, which must stay off the
 * first-paint path (§3). It only ever matters once the profile has loaded anyway.
 */
const NamePrompt = lazy(() =>
  import('./NamePrompt').then((module) => ({ default: module.NamePrompt })),
);

/** Lazy too: it only ever shows on a phone, so it need not cost a desktop's first paint. */
const AppBanner = lazy(() =>
  import('./AppBanner').then((module) => ({ default: module.AppBanner })),
);

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
      <Suspense fallback={null}>
        <AppBanner />
      </Suspense>
      <Suspense fallback={null}>
        <NamePrompt />
      </Suspense>
      <BottomNav />
    </div>
  );
}
