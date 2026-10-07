import { DEFAULT_ACCENT_ID, PRIMARY_SHADE, accentById } from '@lift/ui-tokens';
import { useColorScheme } from 'react-native';

/**
 * Colours for the current colour scheme.
 *
 * The accent comes from `@lift/ui-tokens`, the same ramp and shade the web
 * theme uses, so the two apps read as one product. The neutrals approximate
 * Mantine's defaults, which the web app uses as-is and the tokens do not
 * carry.
 */
export type Palette = {
  background: string;
  surface: string;
  border: string;
  text: string;
  dimmed: string;
  accent: string;
  /** Label colour on a filled accent control; the pastel ramp needs dark text. */
  onAccent: string;
  danger: string;
  /** Strip backgrounds for the sync states. */
  offline: string;
  syncing: string;
  /** A set compared with last time: better, worse, level. As the web's `--delta-*`. */
  up: string;
  down: string;
  same: string;
  /** A set that needs attention: off its rep range, or missing a number. */
  warn: string;
};

const LIGHT = {
  background: '#ffffff',
  surface: '#f8f9fa',
  border: '#dee2e6',
  text: '#212529',
  dimmed: '#868e96',
  danger: '#e03131',
  offline: '#fff3bf',
  syncing: '#e7f5ff',
  up: '#099268',
  down: '#e03131',
  same: '#1c7ed6',
  warn: '#e8590c',
};

const DARK = {
  background: '#1a1b1e',
  surface: '#25262b',
  border: '#373a40',
  text: '#c1c2c5',
  dimmed: '#909296',
  danger: '#ff6b6b',
  offline: '#5c4813',
  syncing: '#1b3a57',
  up: '#38d9a9',
  down: '#ff8787',
  same: '#4dabf7',
  warn: '#ffa94d',
};

export function usePalette(): Palette {
  const dark = useColorScheme() === 'dark';
  const ramp = accentById(DEFAULT_ACCENT_ID).colors;
  return {
    ...(dark ? DARK : LIGHT),
    accent: dark ? ramp[PRIMARY_SHADE.dark] : ramp[PRIMARY_SHADE.light],
    onAccent: '#1a1b1e',
  };
}
