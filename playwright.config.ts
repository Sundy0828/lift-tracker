import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  // The whole suite shares one auth emulator and one preview server, so
  // unbounded parallelism is self-inflicted contention: sign-ins start timing
  // out. Four keeps the suite quick without starving it.
  workers: process.env['CI'] ? 1 : 4,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'on-first-retry',
  },
  /**
   * Two projects over the same tests. `mobile-chrome` is the suite and skips
   * the excluded tags; `excluded` runs only those.
   *
   * `@known-broken` fails on master. `@flaky-drag` depends on a synthetic
   * pointer drag that misses its dwell timer about once in a hundred runs.
   * Both describe behaviour the app should have, so they stay in the file.
   * Run them with `npm run e2e:excluded`.
   */
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      grepInvert: /@known-broken|@flaky-drag/u,
    },
    {
      name: 'excluded',
      use: { ...devices['Pixel 7'] },
      grep: /@known-broken|@flaky-drag/u,
    },
  ],
  // The offline test in phase 5 needs a real service worker, so e2e always runs
  // against a production build rather than the dev server.
  //
  // `--mode e2e` loads .env.e2e, which outranks .env.local in Vite's env
  // precedence. That keeps the suite pointed at the emulator even when
  // .env.local holds a real Firebase project, so tests can never create users
  // or documents in production.
  webServer: {
    command: `npm run build -- --mode e2e && npm run preview -- --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
