import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { manifest } from './src/app/manifest.ts';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const resolveSrc = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * Stops the app stylesheet from blocking the first paint.
 *
 * `index.html` paints a splash with its own inline CSS, so nothing on screen
 * before React mounts needs Mantine's stylesheet — but a plain
 * `<link rel="stylesheet">` in the head holds the whole document back until it
 * arrives. Measured on a throttled mobile profile that was 1.5 s of blank
 * screen, and the largest single item in the §3 LCP budget.
 *
 * `rel="preload"` fetches it at the same high priority and applies it the
 * moment it lands, which is long before the entry bundle has finished parsing
 * — the stylesheet is a quarter of the size and requested in the same breath.
 * `media="print"` would also work and is the better known trick, but Chrome
 * de-prioritises a print stylesheet, which is the opposite of what is wanted.
 *
 * The `onload` attribute is the one thing here that a Content-Security-Policy
 * would break, and it would break it silently — the whole app unstyled. There
 * is no CSP on this project today; if one is added it needs `'unsafe-hashes'`
 * alongside `'unsafe-inline'`, because the latter covers the inline script in
 * `index.html` but not an inline event handler.
 */
function nonBlockingStylesheet(): Plugin {
  return {
    name: 'non-blocking-stylesheet',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<link rel="stylesheet"([^>]*?)href="([^"]+)"([^>]*)>/gu,
          (_match, before: string, href: string, after: string) =>
            `<link rel="preload" as="style"${before}href="${href}"${after} onload="this.rel='stylesheet'">` +
            `<noscript><link rel="stylesheet" href="${href}"></noscript>`,
        );
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { '@': resolveSrc('./src') },
  },
  plugins: [
    react(),
    VitePWA({
      // A custom service worker is required: it precaches the exercise catalog
      // (phase 1) and drives rest-timer notifications (phase 3).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest,
      devOptions: { enabled: false, type: 'module' },
    }),
    nonBlockingStylesheet(),
    // Emits stats.html next to the bundle; the budget check in phase 7 reads it.
    visualizer({ filename: 'dist/stats.html', gzipSize: true, template: 'treemap' }),
  ],
  build: {
    target: 'es2022',
    sourcemap: mode !== 'production',
    rolldownOptions: {
      output: {
        /**
         * Named vendor groups, so `npm run build` prints a per-library size
         * table that can be read against the §3 budgets, and so a Mantine or
         * React upgrade does not invalidate the app's own chunk.
         *
         * Grouping does not make anything eager: `fb-firestore` is reachable
         * only through a dynamic import, so it stays out of the initial load.
         */
        advancedChunks: {
          groups: [
            // fb-core must be matched first. The shared @firebase/app modules
            // would otherwise be absorbed into the Firestore chunk, which
            // makes fb-auth import it statically and drags all ~149 kB of
            // Firestore back onto the first-paint path.
            {
              name: 'fb-core',
              test: /\/(firebase|@firebase)\/(app|util|component|logger|installations)\//,
            },
            { name: 'fb-firestore', test: /\/(firebase|@firebase)\/firestore/ },
            { name: 'fb-auth', test: /\/(firebase|@firebase)\/auth/ },
            // Deliberately NOT grouped: @mantine. Its components span eager
            // (shell) and lazy (route-only, e.g. MultiSelect / Modal / Drawer)
            // use, and forcing them into one vendor chunk drags the lazy ones
            // onto the first-paint path — measured at +35 kB gzipped.
            { name: 'router', test: /\/react-router\// },
            { name: 'react', test: /\/node_modules\/(react|react-dom|scheduler)\// },
          ],
        },
      },
    },
  },
  server: { port: 5173 },
  test: {
    /**
     * Node by default. Only three test files touch a DOM; the rest are pure
     * domain logic, and standing up a jsdom for each of those cost more than
     * every assertion in the suite put together — enough to starve the
     * wall-clock budget in `search.test.ts` as the suite grew. The three that
     * need one opt in with a `@vitest-environment jsdom` docblock.
     */
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['src/domain/**/*.test.ts'],
    },
  },
}));
