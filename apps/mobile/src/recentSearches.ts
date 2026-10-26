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
      if (cancelled) return;
      setRecent((current) => {
        const stored = parseRecentSearches(raw);
        if (current.length === 0) return stored;
        // Searches remembered before the read landed go on top of the stored
        // list, oldest first so the newest ends up at the front.
        const merged = current.reduceRight<readonly string[]>(
          (list, query) => rememberSearch(list, query),
          stored,
        );
        writeItem(KEY, JSON.stringify(merged));
        return merged;
      });
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
