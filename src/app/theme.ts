import {
  createTheme,
  type ButtonProps,
  type MantineColorsTuple,
  type MantineTheme,
} from '@mantine/core';

/**
 * The accent colour, and the presets it can be swapped for.
 *
 * **Every preset is registered under the one name `sky`.** The accent is
 * referenced as `--mantine-color-sky-*` from three dozen places — set rows,
 * the rest bar, the overlay line, the drag handles — and naming the slot after
 * the colour that happens to be in it would mean a preset could only ever be
 * blue. So `sky` is the slot; the preset decides what is in it.
 *
 * Each ramp is pastel at the shades the theme uses (`primaryShade` 7 light,
 * 4 dark) and is paired with `autoContrast`, which picks a dark or light label
 * for filled controls rather than assuming one.
 */

/** Baby blue: reads clearly against the near-black gym-lighting dark scheme. */
const sky: MantineColorsTuple = [
  '#eef8fd',
  '#dcf0fa',
  '#b8e2f6',
  '#92d3f1',
  '#74c7ee',
  '#62c0ec',
  '#56bced',
  '#47a5d2',
  '#3892bc',
  '#237ea6',
];

/** Warm orange. The loudest of the set, and the easiest to see in daylight. */
const ember: MantineColorsTuple = [
  '#fff4e6',
  '#ffe8cc',
  '#ffd0a1',
  '#ffb672',
  '#ffa04d',
  '#ff9233',
  '#ff8b26',
  '#e47719',
  '#cb6912',
  '#b15a06',
];

/** Muted green. The quietest, and the one that looks least like a warning. */
const moss: MantineColorsTuple = [
  '#eef7ee',
  '#e0ebe1',
  '#c2d5c3',
  '#a1bfa3',
  '#86ad88',
  '#74a176',
  '#6a9c6d',
  '#59885c',
  '#4d7950',
  '#3d6941',
];

/** Violet. Furthest from the red and teal the set assessments already use. */
const violet: MantineColorsTuple = [
  '#f3edff',
  '#e3d8fc',
  '#c4adf7',
  '#a480f2',
  '#895aee',
  '#7842ec',
  '#6f36ec',
  '#5f2ad2',
  '#5424bc',
  '#481ca6',
];

/** Near-neutral. For a screen that should carry no colour but the verdicts. */
const slate: MantineColorsTuple = [
  '#f4f6f8',
  '#e7eaed',
  '#ccd2d9',
  '#aeb9c4',
  '#95a4b3',
  '#8597a9',
  '#7c8fa4',
  '#6a7c90',
  '#5d6e81',
  '#4d5f73',
];

export type ThemePreset = {
  id: string;
  label: string;
  colors: MantineColorsTuple;
};

export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: 'sky', label: 'Sky', colors: sky },
  { id: 'ember', label: 'Ember', colors: ember },
  { id: 'moss', label: 'Moss', colors: moss },
  { id: 'violet', label: 'Violet', colors: violet },
  { id: 'slate', label: 'Slate', colors: slate },
];

export const DEFAULT_PRESET_ID = 'sky';

export function presetById(id: string): ThemePreset {
  return (
    THEME_PRESETS.find((preset) => preset.id === id) ??
    THEME_PRESETS[0] ?? { id: DEFAULT_PRESET_ID, label: 'Sky', colors: sky }
  );
}

/** Height and horizontal padding for each compact Button size. */
const COMPACT_BUTTON_SIZES: Record<string, { height: string; paddingX: string }> = {
  // Sits inline in set rows and the rest-timer bar, so it stays dense.
  'compact-xs': { height: '30px', paddingX: '12px' },
  'compact-sm': { height: '36px', paddingX: '16px' },
  'compact-md': { height: '36px', paddingX: '16px' },
};

export function buildTheme(presetId: string = DEFAULT_PRESET_ID) {
  return createTheme({
    primaryColor: 'sky',
    primaryShade: { light: 7, dark: 4 },
    colors: { sky: presetById(presetId).colors },
    // A pastel primary needs dark label text on filled controls to stay readable.
    autoContrast: true,
    defaultRadius: 'md',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    headings: { fontWeight: '650' },
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
              '--button-height': compact.height,
              '--button-padding-x': compact.paddingX,
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
