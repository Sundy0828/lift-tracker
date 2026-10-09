import {
  DEFAULT_ACCENT_ID,
  DEFAULT_COLOR_SCHEME,
  accentById,
  schemeColors,
  type SchemeColors,
} from '@lift/ui-tokens';

/**
 * Colours, from the tokens the web theme is built on (`@lift/ui-tokens`), so
 * a row, a border or a dimmed label is the same hex on the phone as in the
 * browser.
 *
 * The scheme is the web's default, dark, rather than the phone's system
 * setting. The web keeps the choice per device (System, Light or Dark in its
 * Settings), and the phone's Settings screen gets the same choice in Phase 5;
 * until then, matching the web's default is what keeps the two apps looking
 * like one.
 */
export type Palette = SchemeColors & {
  /** The page behind everything. The web's `--mantine-color-body`. */
  background: string;
};

const PALETTE: Palette = (() => {
  const colors = schemeColors(DEFAULT_COLOR_SCHEME, accentById(DEFAULT_ACCENT_ID).colors);
  return { ...colors, background: colors.body };
})();

export function usePalette(): Palette {
  return PALETTE;
}
