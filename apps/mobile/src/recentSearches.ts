import type AsyncStorageModule from '@react-native-async-storage/async-storage';
import { parseRecentSearches, rememberSearch } from '@lift/domain/recentSearches';
import { useCallback, useEffect, useState } from 'react';

/**
 * The last few exercise searches that led somewhere, on this phone.
 *
 * The web keeps the same list in `localStorage` under the same key; the rules
 * are shared (`@lift/domain/recentSearches`). AsyncStorage is asynchronous, so
 * the list arrives a moment after the picker opens, which is before anyone
 * has looked at it.
 */

const KEY = 'lift-tracker.recent-exercise-searches';

type Storage = typeof AsyncStorageModule;

let storage: Promise<Storage | null> | null = null;

/**
 * AsyncStorage, loaded on first use rather than imported.
 *
 * Its module throws at import when the native half is missing (a dev build
 * older than the JS it runs). Imported statically, that took the whole editor
 * route down with it; loaded here, it costs only this shortcut.
 */
function loadStorage(): Promise<Storage | null> {
  storage ??= import('@react-native-async-storage/async-storage').then(
    (module) => module.default,
    () => null,
  );
  return storage;
}

function write(values: readonly string[]): void {
  // A failed write costs the shortcut next launch, nothing more.
  loadStorage()
    .then((store) => store?.setItem(KEY, JSON.stringify(values)))
    .catch(() => undefined);
}

export function useRecentSearches(): {
  recent: readonly string[];
  remember: (query: string) => void;
} {
  const [recent, setRecent] = useState<readonly string[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadStorage()
      .then((store) => store?.getItem(KEY) ?? null)
      .then(
        (raw) => {
          // A search remembered before the read landed wins over the stored list.
          if (!cancelled)
            setRecent((current) => (current.length > 0 ? current : parseRecentSearches(raw)));
        },
        () => undefined,
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((query: string): void => {
    setRecent((current) => {
      const next = rememberSearch(current, query);
      if (next !== current) write(next);
      return next;
    });
  }, []);

  return { recent, remember };
}
