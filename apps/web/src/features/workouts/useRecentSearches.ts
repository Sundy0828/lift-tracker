import { useCallback, useState } from 'react';
import { parseRecentSearches, rememberSearch } from '@lift/domain/recentSearches';

/**
 * The last few exercise searches that led somewhere, per device.
 *
 * `localStorage`, not the profile: this is a typing shortcut, not training
 * data, and it is worth nothing on another device. The list's rules are
 * shared with the phone (`@lift/domain/recentSearches`).
 */

const KEY = 'lift-tracker.recent-exercise-searches';

function read(): string[] {
  try {
    return parseRecentSearches(localStorage.getItem(KEY));
  } catch {
    // Private mode or blocked site data. An empty history costs a person
    // nothing.
    return [];
  }
}

function write(values: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    // Nothing to do: the shortcut is gone next launch, which is a nuisance
    // rather than a fault.
  }
}

export type RecentSearches = {
  recent: readonly string[];
  /** Moves a query to the front, newest first, deduped case-insensitively. */
  remember: (query: string) => void;
  clear: () => void;
};

export function useRecentSearches(): RecentSearches {
  const [recent, setRecent] = useState<readonly string[]>(read);

  const remember = useCallback((query: string): void => {
    setRecent((current) => {
      const next = rememberSearch(current, query);
      if (next !== current) write(next);
      return next;
    });
  }, []);

  const clear = useCallback((): void => {
    write([]);
    setRecent([]);
  }, []);

  return { recent, remember, clear };
}
