import { createTheme, type ButtonProps, type MantineTheme } from '@mantine/core';
import {
  ACCENT_PRESETS,
  COMPACT_BUTTON_SIZES,
  DEFAULT_ACCENT_ID,
  FONT_FAMILY,
  HEADING_WEIGHT,
  PRIMARY_SHADE,
  accentById,
  type AccentPreset,
} from '@lift/ui-tokens';

/**
 * The Mantine theme, built from the shared tokens in `@lift/ui-tokens`.
 *
 * **Every accent preset is registered under the one name `sky`.** The accent is
 * referenced as `--mantine-color-sky-*` from three dozen places — set rows,
 * the rest bar, the overlay line, the drag handles — and naming the slot after
 * the colour that happens to be in it would mean a preset could only ever be
 * blue. So `sky` is the slot; the preset decides what is in it.
 *
 * Each ramp is paired with `autoContrast`, which picks a dark or light label
 * for filled controls rather than assuming one.
 */

export type ThemePreset = AccentPreset;
export const THEME_PRESETS = ACCENT_PRESETS;
export const DEFAULT_PRESET_ID = DEFAULT_ACCENT_ID;
export const presetById = accentById;

const px = (value: number): string => `${String(value)}px`;

export function buildTheme(presetId: string = DEFAULT_PRESET_ID) {
  return createTheme({
    primaryColor: 'sky',
    primaryShade: PRIMARY_SHADE,
    colors: { sky: presetById(presetId).colors },
    // A pastel primary needs dark label text on filled controls to stay readable.
    autoContrast: true,
    defaultRadius: 'md',
    fontFamily: FONT_FAMILY,
    headings: { fontWeight: String(HEADING_WEIGHT) },
    // Touch targets first: the set grid is used with one thumb, mid-session.
    components: {
      Button: {
        defaultProps: { size: 'md' },
        // Gives the compact sizes room around the label. Other sizes keep the
        // Mantine values.
        vars: (_theme: MantineTheme, props: ButtonProps) => {
          const compact = COMPACT_BUTTON_SIZES[props.size ?? ''];
          if (compact === undefined) return { root: {} };
          return {
            root: {
              '--button-height': px(compact.height),
              '--button-padding-x': px(compact.paddingX),
            },
          };
        },
      },
      NumberInput: { defaultProps: { size: 'md' } },
      TextInput: { defaultProps: { size: 'md' } },
      PasswordInput: { defaultProps: { size: 'md' } },
    },
  });
}
