/**
 * Design tokens shared by the web theme (Mantine) and the mobile styles
 * (React Native). Plain values only: no UI framework imports, so both apps can
 * consume them and neither app's styling can drift from the other's.
 *
 * Sizes are unitless pixel numbers. The web theme appends `px`; React Native
 * takes the number as-is.
 */

/** Ten shades, lightest first, in the shape Mantine's colour tuples use. */
export type ColorRamp = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/*
 * The accent colour, and the presets it can be swapped for.
 *
 * Each ramp is pastel at the shades the theme uses (`PRIMARY_SHADE`: 7 light,
 * 4 dark), so a filled control needs its label colour picked for contrast
 * rather than assumed.
 */

/** Baby blue: reads clearly against the near-black gym-lighting dark scheme. */
const sky: ColorRamp = [
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
const ember: ColorRamp = [
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
const moss: ColorRamp = [
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
const violet: ColorRamp = [
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
const slate: ColorRamp = [
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

export type AccentPreset = {
  id: string;
  label: string;
  colors: ColorRamp;
};

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'sky', label: 'Sky', colors: sky },
  { id: 'ember', label: 'Ember', colors: ember },
  { id: 'moss', label: 'Moss', colors: moss },
  { id: 'violet', label: 'Violet', colors: violet },
  { id: 'slate', label: 'Slate', colors: slate },
];

export const DEFAULT_ACCENT_ID = 'sky';

export function accentById(id: string): AccentPreset {
  return (
    ACCENT_PRESETS.find((preset) => preset.id === id) ??
    ACCENT_PRESETS[0] ?? { id: DEFAULT_ACCENT_ID, label: 'Sky', colors: sky }
  );
}

/** Which shade of the accent ramp is "the" accent, per colour scheme. */
export const PRIMARY_SHADE = { light: 7, dark: 4 } as const;

export const FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const HEADING_WEIGHT = 650;

/**
 * Height and horizontal padding for each compact button size. The xs size sits
 * inline in set rows and the rest-timer bar, so it stays dense.
 */
export const COMPACT_BUTTON_SIZES: Readonly<Record<string, { height: number; paddingX: number }>> =
  {
    'compact-xs': { height: 30, paddingX: 12 },
    'compact-sm': { height: 36, paddingX: 16 },
    'compact-md': { height: 36, paddingX: 16 },
  };
