import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * jsdom gaps that every component test would otherwise have to patch.
 *
 * `matchMedia` is needed by Mantine's provider, which resolves the colour
 * scheme on mount. The pointer-capture pair is used by the swipe gesture,
 * where capture is an optimisation rather than part of the behaviour — so a
 * no-op is a faithful stand-in.
 *
 * Guarded on a DOM being present, because this file also runs for the pure
 * domain tests, which are in the `node` environment and have no `window` to
 * patch (see the `test` block in vite.config.ts).
 */
const hasDom = typeof window !== 'undefined';

if (hasDom) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}

afterEach(() => {
  if (hasDom) cleanup();
});
