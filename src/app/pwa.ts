import { Workbox } from 'workbox-window';

/**
 * Registers the custom service worker. Kept out of the render path: a failed or
 * unsupported registration must never stop the app from loading, and an update
 * is applied on the next visit rather than interrupting an active session.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  const wb = new Workbox('/sw.js', { scope: '/' });

  wb.addEventListener('waiting', () => {
    // A new build is ready. Activating mid-workout would reload the page, so
    // it waits until every tab is closed.
    console.info('[pwa] update ready; will apply on next launch');
  });

  wb.register().catch((error: unknown) => {
    console.warn('[pwa] service worker registration failed', error);
  });
}
