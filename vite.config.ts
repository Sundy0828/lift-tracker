import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const resolveSrc = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

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
      manifest: {
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
      },
      devOptions: { enabled: false, type: 'module' },
    }),
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
    environment: 'jsdom',
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
