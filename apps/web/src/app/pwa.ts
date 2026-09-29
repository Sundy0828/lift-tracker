import { whenIdle } from './whenIdle';

/**
 * Registers the custom service worker.
 *
 * Kept out of the render path: a failed or unsupported registration must never
 * stop the app from loading, and an update is applied on the next visit rather
 * than interrupting an active session.
 *
 * The plain browser API, not `workbox-window`. That wrapper cost 5.6 kB and a
 * chunk to evaluate while the first screen was still becoming interactive, and
 * all it was used for was the log line below.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  whenIdle(() => {
    void register();
  });
}

async function register(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

    registration.addEventListener('updatefound', () => {
      // A new build is installing. Activating mid-workout would reload the
      // page, so it waits until every tab is closed.
      console.info('[pwa] update ready; will apply on next launch');
    });
  } catch (error: unknown) {
    console.warn('[pwa] service worker registration failed', error);
  }
}
