import { useCallback, useState } from 'react';

/**
 * The last few exercise searches that led somewhere, per device.
 *
 * `localStorage`, not the profile: this is a typing shortcut, not training
 * data, and it is worth nothing on another device.
 */

const KEY = 'lift-tracker.recent-exercise-searches';

/** Enough to cover a training block's worth of habits, short enough to scan. */
const MAX = 6;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as readonly unknown[])
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .slice(0, MAX);
  } catch {
    // Private mode, blocked site data, or somebody else's JSON in the key.
    // An empty history costs a person nothing.
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
    const trimmed = query.trim();
    if (trimmed === '') return;

    setRecent((current) => {
      const key = trimmed.toLowerCase();
      const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== key)].slice(0, MAX);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback((): void => {
    write([]);
    setRecent([]);
  }, []);

  return { recent, remember, clear };
}
