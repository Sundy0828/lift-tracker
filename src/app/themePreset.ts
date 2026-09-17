import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PRESET_ID, THEME_PRESETS } from './theme';

/**
 * Which accent preset this device uses.
 *
 * Stored in `localStorage`, not in the profile, for two reasons. It is a
 * display preference like the colour scheme, which Mantine already keeps
 * locally — and the profile is read through Firestore, which would drag the
 * whole SDK into the entry bundle just to paint the first screen (§3).
 *
 * Every read is guarded: private browsing and blocked site data both make
 * `localStorage` throw rather than return nothing.
 */
const KEY = 'lift-tracker-theme-preset';

function isPreset(value: string): boolean {
  return THEME_PRESETS.some((preset) => preset.id === value);
}

export function readThemePreset(): string {
  try {
    const stored = localStorage.getItem(KEY);
    return stored !== null && isPreset(stored) ? stored : DEFAULT_PRESET_ID;
  } catch {
    return DEFAULT_PRESET_ID;
  }
}

function writeThemePreset(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // A preset that cannot be remembered still applies for this session.
  }
}

/** Fired on the window, so Settings and the provider stay in step. */
const CHANGED = 'lift-tracker:theme-preset';

/** The active preset, and the setter that swaps it everywhere at once. */
export function useThemePreset(): [string, (id: string) => void] {
  const [preset, setPreset] = useState(readThemePreset);

  useEffect(() => {
    const sync = (): void => {
      setPreset(readThemePreset());
    };
    window.addEventListener(CHANGED, sync);
    // `storage` only fires in *other* tabs, which is exactly the case the
    // custom event above cannot cover.
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const choose = useCallback((id: string) => {
    writeThemePreset(id);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return [preset, choose];
}
