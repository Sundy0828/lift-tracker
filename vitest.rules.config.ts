import { defineConfig } from 'vitest/config';

/**
 * The security-rules suite, kept separate from `npm test` on purpose.
 *
 * These tests talk to the Firestore emulator, so they need Java and a running
 * `npm run emulators` — while the unit suite needs nothing but node. Folding
 * them together would make the fast, always-runnable gate depend on the slow,
 * sometimes-unavailable one.
 *
 * Single-threaded and serial: every case shares one emulator instance and
 * clears the database between cases, so parallel files would clear each
 * other's data out from under them.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['rules/**/*.test.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    // A cold emulator connection is slower than a unit test by a wide margin.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
