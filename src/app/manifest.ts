import type { ManifestOptions } from 'vite-plugin-pwa';

/**
 * The web app manifest, and the reason it is a module rather than a literal in
 * `vite.config.ts`: `manifest.test.ts` asserts the installability criteria
 * against it.
 *
 * Lighthouse used to do that. Version 12 removed the PWA category and every
 * installability audit with it, so the §3 "PWA >= 95" budget has nothing left
 * to score it. The test is what enforces it now.
 */
export const manifest = {
  id: '/',
  name: 'Lift Tracker',
  short_name: 'Lift',
  description: 'Plan, log, and review your lifting sessions.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#12100f',
  theme_color: '#12100f',
  categories: ['health', 'fitness'],
  /**
   * Long-press the installed icon and get where you are going in one tap.
   *
   * There is deliberately no "today's workout" target: this product has
   * no schedule (§0), so nothing can know which workout today is. The
   * honest shortcut lands on Today's start list — which is also where a
   * session in progress offers to resume — and the second skips to the
   * log, the other reason the app gets opened.
   */
  shortcuts: [
    {
      name: 'Start a workout',
      short_name: 'Start',
      url: '/',
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    },
    {
      name: 'History',
      short_name: 'History',
      url: '/history',
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    },
  ],
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    {
      src: '/icons/maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
} satisfies Partial<ManifestOptions>;
