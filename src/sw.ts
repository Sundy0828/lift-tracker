/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import type { WorkboxPlugin } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

/**
 * Custom service worker (injectManifest). The app shell and the exercise
 * catalog are precached; the rest-timer notifications (phase 3) hook in here.
 */
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

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

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
