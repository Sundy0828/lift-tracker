import { parseRecentSearches, rememberSearch } from '@lift/domain/recentSearches';
import { useCallback, useEffect, useState } from 'react';
import { readItem, writeItem } from './storage';

/**
 * The last few exercise searches that led somewhere, on this phone.
 *
 * The web keeps the same list in `localStorage` under the same key; the rules
 * are shared (`@lift/domain/recentSearches`). AsyncStorage is asynchronous, so
 * the list arrives a moment after the picker opens, which is before anyone
 * has looked at it.
 */

const KEY = 'lift-tracker.recent-exercise-searches';

export function useRecentSearches(): {
  recent: readonly string[];
  remember: (query: string) => void;
} {
  const [recent, setRecent] = useState<readonly string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void readItem(KEY).then((raw) => {
      // A search remembered before the read landed wins over the stored list.
      if (!cancelled)
        setRecent((current) => (current.length > 0 ? current : parseRecentSearches(raw)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((query: string): void => {
    setRecent((current) => {
      const next = rememberSearch(current, query);
      if (next !== current) writeItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { recent, remember };
}
