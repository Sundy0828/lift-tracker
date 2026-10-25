import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_ID,
  DEFAULT_COLOR_SCHEME,
  accentById,
  schemeColors,
  type ColorScheme,
  type SchemeColors,
} from '@lift/ui-tokens';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { readItem, writeItem } from './storage';

/**
 * Colours, from the tokens the web theme is built on (`@lift/ui-tokens`), so
 * a row, a border or a dimmed label is the same hex on the phone as in the
 * browser.
 *
 * The scheme and the accent are chosen in Settings, as on the web: System,
 * Light or Dark, and one of the accent presets. Both are kept on this phone
 * rather than in the profile, for the web's reason: they have to be right on
 * the first frame, and the profile arrives over Firestore. A second device
 * starts on the defaults, which are the web's: dark, sky.
 */
export type Palette = SchemeColors & {
  /** The page behind everything. The web's `--mantine-color-body`. */
  background: string;
  /** Which scheme this palette is, for the status bar. */
  scheme: ColorScheme;
};

/** What Settings offers. `auto` follows the phone, as Mantine's does. */
export type SchemePreference = 'auto' | 'light' | 'dark';

/** The web's keys, so the two read alike in a debugger. */
const SCHEME_KEY = 'mantine-color-scheme-value';
const ACCENT_KEY = 'lift-tracker-theme-preset';

function isPreference(value: string | null): value is SchemePreference {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function isAccent(value: string | null): value is string {
  return ACCENT_PRESETS.some((preset) => preset.id === value);
}

function paletteFor(scheme: ColorScheme, accentId: string): Palette {
  const colors = schemeColors(scheme, accentById(accentId).colors);
  return { ...colors, background: colors.body, scheme };
}

type Theme = {
  palette: Palette;
  preference: SchemePreference;
  accentId: string;
  setPreference: (preference: SchemePreference) => void;
  setAccent: (accentId: string) => void;
};

const DEFAULT_PALETTE = paletteFor(DEFAULT_COLOR_SCHEME, DEFAULT_ACCENT_ID);

const ThemeContext = createContext<Theme>({
  palette: DEFAULT_PALETTE,
  preference: DEFAULT_COLOR_SCHEME,
  accentId: DEFAULT_ACCENT_ID,
  setPreference: () => undefined,
  setAccent: () => undefined,
});

/**
 * Holds the choice and resolves it to a palette.
 *
 * Renders nothing until the stored choice is read. That read is a few
 * milliseconds; painting the default first would flash a dark screen at
 * everyone who picked Light.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [loaded, setLoaded] = useState(false);
  const [preference, setPreferenceState] = useState<SchemePreference>(DEFAULT_COLOR_SCHEME);
  const [accentId, setAccentState] = useState(DEFAULT_ACCENT_ID);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readItem(SCHEME_KEY), readItem(ACCENT_KEY)]).then(([scheme, accent]) => {
      if (cancelled) return;
      if (isPreference(scheme)) setPreferenceState(scheme);
      if (isAccent(accent)) setAccentState(accent);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: SchemePreference): void => {
    setPreferenceState(next);
    writeItem(SCHEME_KEY, next);
  }, []);

  const setAccent = useCallback((next: string): void => {
    if (!isAccent(next)) return;
    setAccentState(next);
    writeItem(ACCENT_KEY, next);
  }, []);

  // `auto` with no answer from the phone falls back to the web's default.
  const scheme: ColorScheme =
    preference === 'auto'
      ? system === 'light' || system === 'dark'
        ? system
        : DEFAULT_COLOR_SCHEME
      : preference;

  const value = useMemo<Theme>(
    () => ({
      palette: paletteFor(scheme, accentId),
      preference,
      accentId,
      setPreference,
      setAccent,
    }),
    [scheme, accentId, preference, setPreference, setAccent],
  );

  if (!loaded) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function usePalette(): Palette {
  return useContext(ThemeContext).palette;
}

/** The choice itself, for Settings. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
