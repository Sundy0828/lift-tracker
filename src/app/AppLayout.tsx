import { Center, Loader } from '@mantine/core';
import { Suspense } from 'react';
import { Outlet } from 'react-router';
import classes from './AppLayout.module.css';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className={classes.shell}>
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
