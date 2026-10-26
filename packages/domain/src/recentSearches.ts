/**
 * The last few exercise searches that led somewhere, newest first.
 *
 * Kept per device by each app (`localStorage` on the web, AsyncStorage on a
 * phone): it is a typing shortcut, not training data, and worth nothing on
 * another device. Only the list's rules live here, so both apps keep the same
 * ones.
 */

/** Enough to cover a training block's worth of habits, short enough to scan. */
export const MAX_RECENT_SEARCHES = 6;

/** Moves a query to the front, deduped case-insensitively. Blank queries are ignored. */
export function rememberSearch(recent: readonly string[], query: string): readonly string[] {
  const trimmed = query.trim();
  if (trimmed === '') return recent;

  const key = trimmed.toLowerCase();
  return [trimmed, ...recent.filter((item) => item.toLowerCase() !== key)].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
}

/**
 * The stored list, from whatever JSON the key holds: somebody else's value, an
 * older shape or a hand-edited one all read as the strings they contain, or
 * as nothing.
 */
export function parseRecentSearches(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as readonly unknown[])
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}
