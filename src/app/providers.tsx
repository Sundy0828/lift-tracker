import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/data/hooks/useAuth';
import { theme } from './theme';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-center" limit={3} />
      <AuthProvider>{children}</AuthProvider>
    </MantineProvider>
  );
}
