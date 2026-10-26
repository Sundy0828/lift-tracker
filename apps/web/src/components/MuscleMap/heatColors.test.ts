import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HEAT_STOPS } from '@lift/ui-tokens';
import { describe, expect, it } from 'vitest';

/**
 * The phone draws the muscle map from `HEAT_STOPS` in @lift/ui-tokens; the web
 * draws it from this CSS module, which cannot import TypeScript. This keeps
 * the two from drifting apart: change a stop in one place and this fails
 * until the other matches.
 */
const css = readFileSync(fileURLToPath(new URL('./MuscleMap.module.css', import.meta.url)), 'utf8');

describe('muscle map colours', () => {
  it('match the shared tokens for every stop with a literal colour', () => {
    // Stop 0 is a Mantine variable (gray-2 / dark-5); the others are hex.
    for (const stop of [1, 2, 3, 4] as const) {
      const rule = new RegExp(
        String.raw`\.stop${String(stop)}\s*\{[^}]*light-dark\(([^,]+),\s*([^)]+)\)`,
      );
      const match = rule.exec(css);
      expect(match?.[1]?.trim().toLowerCase()).toBe(HEAT_STOPS.light[stop]);
      expect(match?.[2]?.trim().toLowerCase()).toBe(HEAT_STOPS.dark[stop]);
    }
  });

  it('use gray-2 and dark-5 for an untrained muscle', () => {
    expect(css).toMatch(
      /\.stop0\s*\{[^}]*light-dark\(var\(--mantine-color-gray-2\),\s*var\(--mantine-color-dark-5\)\)/,
    );
  });
});
