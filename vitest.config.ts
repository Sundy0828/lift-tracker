import { defineConfig } from 'vitest/config';

/**
 * The unit suite for the whole workspace: `pnpm test` at the root.
 *
 * Each package runs as its own project with its own settings. The packages
 * have no config file, so they get Vitest's defaults (node, no globals), which
 * is all pure logic needs. The web app's project reads the `test` block in
 * `apps/web/vite.config.ts`. The security-rules suite is not listed: it needs
 * the Firestore emulator (see `rules/vitest.config.ts`).
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/web'],
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['packages/domain/src/**/*.test.ts'],
    },
  },
});
