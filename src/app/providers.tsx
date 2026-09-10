import { MantineProvider } from '@mantine/core';
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { AuthProvider } from '@/data/hooks/useAuth';
import { hideSplash } from './splash';
import { theme } from './theme';

/**
 * Off the entry bundle. The container and its transition library cost ~14 kB
 * gzipped and nothing notifies on load — every `notifications.show` call in the
 * app answers a tap, so the container only has to exist before the first one.
 */
const Notifications = lazy(async () => ({
  default: (await import('@mantine/notifications')).Notifications,
}));

/** Loading it during page load competes with the first screen becoming interactive. */
const FIRST_INTERACTION = ['pointerdown', 'keydown'] as const;

/**
 * Mounts the notification container on the first tap or keypress.
 *
 * Every notification in the app answers an action, so nothing can need this
 * before then — and on idle instead, its 27 kB of chunk evaluation landed while
 * the first screen was still settling, which is the one window that has a
 * budget (§3). The import starts on `pointerdown`, ahead of the `click` that
 * does the work.
 *
 * A notification raised before the container mounts is not lost:
 * `notifications.show` writes to a module-level store, and the container
 * renders whatever is already in it.
 */
function DeferredNotifications() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return undefined;

    const mount = (): void => {
      setMounted(true);
    };

    for (const event of FIRST_INTERACTION) {
      window.addEventListener(event, mount, { once: true, passive: true });
    }

    return () => {
      for (const event of FIRST_INTERACTION) {
        window.removeEventListener(event, mount);
      }
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <Suspense fallback={null}>
      <Notifications position="top-center" limit={3} />
    </Suspense>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(hideSplash, []);

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <DeferredNotifications />
      <AuthProvider>{children}</AuthProvider>
    </MantineProvider>
  );
}
