/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import type { WorkboxPlugin } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

/**
 * Custom service worker (injectManifest). The app shell and the exercise
 * catalog are precached, and the rest timer's notification is fired from here.
 */
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

/**
 * Every in-app path falls back to the shell, the way the hosting rewrite does.
 *
 * The app is one page with client-side routes, so `/session/abc123` is not a
 * file and is not in the precache manifest. Online, Firebase Hosting rewrites
 * it to `/index.html` (see firebase.json) — offline, that rewrite is this
 * worker's job. Without it a reload anywhere but `/` fails outright, which is
 * precisely the case §2.8 cares about: mid-session, no signal, screen locked,
 * the tab gets reloaded and the workout has to still be there.
 *
 * The denylist keeps Firebase's own reserved `/__/*` paths (auth helpers,
 * hosting internals) going to the network instead of being handed the shell.
 * Cross-origin navigations need no exclusion — they are outside this worker's
 * scope, so it never sees them.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/__\//u] }),
);

/**
 * Exercise images are remote (free-exercise-db on raw.githubusercontent.com)
 * and cannot be precached — vendoring ~1750 JPEGs is not worth it. They are
 * immutable once published, so cache-first is right: an exercise you have
 * looked at renders offline, and scrolling the picker a second time costs no
 * data.
 *
 * The cap keeps the cache bounded on a phone; least-recently-used entries are
 * evicted past it.
 */
// Workbox's plugin classes declare their optional hooks as `hook?: Fn`, which
// `exactOptionalPropertyTypes` treats as incompatible with the `WorkboxPlugin`
// interface's own optional hooks. The instances are correct at runtime, so the
// casts bridge a library typing quirk rather than hiding a real mismatch.
const imagePlugins: WorkboxPlugin[] = [
  // Opaque cross-origin responses are status 0; caching only real hits stops a
  // 404 being remembered as the answer.
  new CacheableResponsePlugin({ statuses: [200] }) as unknown as WorkboxPlugin,
  new ExpirationPlugin({
    maxEntries: 400,
    maxAgeSeconds: 60 * 60 * 24 * 60,
    purgeOnQuotaError: true,
  }) as unknown as WorkboxPlugin,
];

registerRoute(
  ({ url, request }) =>
    request.destination === 'image' && url.hostname === 'raw.githubusercontent.com',
  new CacheFirst({ cacheName: 'exercise-images-v1', plugins: imagePlugins }),
);

/**
 * The rest timer's notification.
 *
 * It is fired from the worker rather than the page because the page is exactly
 * what is not running: the phone is in a pocket with the screen off, which
 * freezes the page's timers. The worker outlives the page, so a timeout set
 * here still resolves — and a notification is the only thing that can reach
 * you through a dark screen.
 *
 * This is a timeout, not a scheduled trigger. `showTrigger` would survive the
 * worker being evicted, but it is unshipped everywhere, so the honest
 * behaviour is: the notification is best-effort, the on-screen countdown is
 * exact, and neither is required to finish a set.
 */
const REST_TAG = 'rest-timer';

let restTimeout: ReturnType<typeof setTimeout> | null = null;

function cancelRest(): void {
  if (restTimeout !== null) clearTimeout(restTimeout);
  restTimeout = null;
}

async function fireRestNotification(body: string): Promise<void> {
  restTimeout = null;

  // Any previous rest notification is dismissed first. Re-using the tag alone
  // would replace it *silently*, and a rest timer that ends without a buzz has
  // failed at its only job.
  for (const stale of await self.registration.getNotifications({ tag: REST_TAG })) {
    stale.close();
  }

  // A pocket buzz with nothing to look at is worse than nothing, so the
  // notification names what is next.
  await self.registration.showNotification('Rest is over', {
    body,
    tag: REST_TAG,
    requireInteraction: false,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/' },
  });
}

function scheduleRest(endsAt: number, body: string): void {
  cancelRest();
  const delay = endsAt - Date.now();
  if (delay <= 0) {
    void fireRestNotification(body);
    return;
  }
  restTimeout = setTimeout(() => {
    void fireRestNotification(body);
  }, delay);
}

type RestMessage =
  | { type: 'REST_TIMER_START'; endsAt: number; body: string }
  | { type: 'REST_TIMER_CANCEL' }
  | { type: 'SKIP_WAITING' };

function asMessage(data: unknown): RestMessage | null {
  if (typeof data !== 'object' || data === null || !('type' in data)) return null;
  const record = data as Record<string, unknown>;

  if (record['type'] === 'SKIP_WAITING') return { type: 'SKIP_WAITING' };
  if (record['type'] === 'REST_TIMER_CANCEL') return { type: 'REST_TIMER_CANCEL' };
  if (record['type'] === 'REST_TIMER_START') {
    const endsAt: unknown = record['endsAt'];
    if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return null;
    return {
      type: 'REST_TIMER_START',
      endsAt,
      body: typeof record['body'] === 'string' ? record['body'] : 'Next set',
    };
  }
  return null;
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const message = asMessage(event.data);
  if (message === null) return;

  switch (message.type) {
    case 'SKIP_WAITING':
      void self.skipWaiting();
      return;
    case 'REST_TIMER_START':
      scheduleRest(message.endsAt, message.body);
      return;
    case 'REST_TIMER_CANCEL':
      cancelRest();
      return;
  }
});

/** Tapping the notification comes back to the session, not to a new tab. */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients[0];
      if (existing !== undefined) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow('/');
    })(),
  );
});
