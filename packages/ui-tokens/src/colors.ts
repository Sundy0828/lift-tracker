import type { ColorRamp } from './index';

/**
 * The colours both apps draw with, by meaning rather than by hex.
 *
 * The web app styles itself with Mantine's palette and CSS variables
 * (`--mantine-color-body`, `-dimmed`, `-default-border`, …). The phone has no
 * Mantine, so it used to approximate those, and drifted. Now both read the
 * same ramps from here: the web theme registers them with Mantine, and
 * `schemeColors` resolves each meaning to a hex the way Mantine resolves its
 * variables (`default-css-variables-resolver` in @mantine/core 9), so the phone
 * gets the value the web's CSS ends up with.
 *
 * App-specific colours the web writes in its CSS modules (the muscle-map
 * stops, the circuit tint) are here too, and a web test checks the CSS still
 * agrees.
 */

/** Mantine's default neutrals, as @mantine/core 9 ships them. */
export const GRAY: ColorRamp = [
  '#f8f9fa',
  '#f1f3f5',
  '#e9ecef',
  '#dee2e6',
  '#ced4da',
  '#adb5bd',
  '#868e96',
  '#495057',
  '#343a40',
  '#212529',
];

export const DARK: ColorRamp = [
  '#c9c9c9',
  '#b8b8b8',
  '#828282',
  '#696969',
  '#424242',
  '#3b3b3b',
  '#2e2e2e',
  '#242424',
  '#1f1f1f',
  '#141414',
];

/** The status ramps the web uses for deltas, errors and the offline strip. */
export const RED: ColorRamp = [
  '#fff5f5',
  '#ffe3e3',
  '#ffc9c9',
  '#ffa8a8',
  '#ff8787',
  '#ff6b6b',
  '#fa5252',
  '#f03e3e',
  '#e03131',
  '#c92a2a',
];

export const TEAL: ColorRamp = [
  '#e6fcf5',
  '#c3fae8',
  '#96f2d7',
  '#63e6be',
  '#38d9a9',
  '#20c997',
  '#12b886',
  '#0ca678',
  '#099268',
  '#087f5b',
];

export const BLUE: ColorRamp = [
  '#e7f5ff',
  '#d0ebff',
  '#a5d8ff',
  '#74c0fc',
  '#4dabf7',
  '#339af0',
  '#228be6',
  '#1c7ed6',
  '#1971c2',
  '#1864ab',
];

export const ORANGE: ColorRamp = [
  '#fff4e6',
  '#ffe8cc',
  '#ffd8a8',
  '#ffc078',
  '#ffa94d',
  '#ff922b',
  '#fd7e14',
  '#f76707',
  '#e8590c',
  '#d9480f',
];

export type ColorScheme = 'light' | 'dark';

/** The web's default (`defaultColorScheme` in its MantineProvider), and so the phone's. */
export const DEFAULT_COLOR_SCHEME: ColorScheme = 'dark';

/**
 * The muscle map's five stops, 0 = untrained, as `MuscleMap.module.css`
 * writes them. Stop 0 is gray-2 / dark-5.
 */
export const HEAT_STOPS: Readonly<
  Record<ColorScheme, readonly [string, string, string, string, string]>
> = {
  light: [GRAY[2], '#ffe9b8', '#ffcb69', '#f79325', '#d1541a'],
  dark: [DARK[5], '#5c4a22', '#8a6a1f', '#bb7a15', '#ffa604'],
};

export type SchemeColors = {
  /** The page: `--mantine-color-body`. */
  body: string;
  /** A row, card or input: `--mantine-color-default`. */
  surface: string;
  /** The border rows and cards draw: gray-3 / dark-4. */
  border: string;
  text: string;
  dimmed: string;
  placeholder: string;
  /** The accent at its primary shade, and the label on it (Mantine's autoContrast picks black). */
  accent: string;
  onAccent: string;
  /** Destructive actions: the web's armed swipe-to-delete. */
  danger: string;
  /** A set compared with last time: the web's `--delta-up`, `-down`, `-same`. */
  up: string;
  down: string;
  same: string;
  /** Off its rep range, or missing a number. */
  warn: string;
  /** The sync strips. */
  offline: string;
  offlineText: string;
  syncing: string;
  syncingText: string;
  /** A circuit block (`SlotList.module.css`), and a row armed as a group target. */
  circuit: string;
  circuitBorder: string;
  circuitLabel: string;
  groupTarget: string;
  groupTargetBorder: string;
  heat: readonly [string, string, string, string, string];
  /** The body outline's head and knees, and every region's edge. */
  bodyInert: string;
  bodyStroke: string;
};

/** `#rrggbb` at `alpha`, for the translucent tints the web writes as rgba(). */
function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/** Every meaning above, resolved for one scheme and accent ramp. */
export function schemeColors(scheme: ColorScheme, accent: ColorRamp): SchemeColors {
  const light = scheme === 'light';
  return {
    body: light ? '#ffffff' : DARK[7],
    surface: light ? '#ffffff' : DARK[6],
    border: light ? GRAY[3] : DARK[4],
    text: light ? '#000000' : DARK[0],
    dimmed: light ? GRAY[6] : DARK[2],
    placeholder: light ? GRAY[5] : DARK[3],
    accent: light ? accent[7] : accent[4],
    onAccent: '#000000',
    danger: light ? RED[6] : RED[7],
    up: light ? TEAL[8] : TEAL[4],
    down: light ? RED[8] : RED[4],
    same: light ? BLUE[7] : BLUE[4],
    warn: light ? ORANGE[8] : ORANGE[4],
    offline: light ? ORANGE[1] : ORANGE[9],
    offlineText: light ? ORANGE[9] : ORANGE[1],
    syncing: light ? accent[1] : accent[9],
    syncingText: light ? accent[9] : accent[1],
    circuit: light ? accent[0] : withAlpha(accent[6], 0.06),
    circuitBorder: light ? accent[3] : accent[9],
    circuitLabel: light ? accent[8] : accent[4],
    groupTarget: light ? accent[0] : withAlpha(accent[6], 0.12),
    groupTargetBorder: light ? accent[6] : accent[5],
    heat: HEAT_STOPS[scheme],
    bodyInert: light ? GRAY[4] : DARK[4],
    bodyStroke: light ? GRAY[5] : DARK[3],
  };
}

/**
 * Spacing and type, in Mantine's default scale, so a phone screen can be as
 * dense as the web one. Unitless pixels.
 */
export const SPACING = { xs: 10, sm: 12, md: 16, lg: 20, xl: 32 } as const;
export const FONT_SIZE = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 } as const;
/** `defaultRadius: 'md'` on the web. */
export const RADIUS = { sm: 4, md: 8, lg: 16 } as const;
