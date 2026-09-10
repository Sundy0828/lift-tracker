import type { Equipment, Exercise } from './exercises';
import type { MuscleGroup } from './muscles';

/**
 * A prefix-token index over the exercise list. Built once, then every
 * keystroke is a map lookup plus a small intersection — no per-keystroke
 * string scan of 876 entries, and no fuzzy-search dependency (§3).
 *
 * `byPrefix` maps every prefix of every name token to the entries containing
 * it, which is what makes as-you-type matching a lookup rather than a scan.
 * For ~876 exercises that is ~25k short keys, built in a couple of
 * milliseconds.
 */
export type SearchIndex = {
  readonly entries: readonly Exercise[];
  readonly byPrefix: ReadonlyMap<string, readonly number[]>;
};

export type SearchFilters = {
  /** Matches an exercise whose primary *or* secondary muscles include any of these. */
  readonly muscles?: readonly MuscleGroup[];
  /**
   * Narrows `muscles` to primary muscles only.
   *
   * For a body-part tab, which means "this lift trains my back", not "this
   * lift involves the back somewhere": a hang clean lists hamstrings and
   * shows up under Back on secondary involvement alone, which reads as a
   * broken filter rather than a generous one.
   */
  readonly musclesPrimaryOnly?: boolean;
  /** `null` matches entries with no equipment recorded. */
  readonly equipment?: readonly (Equipment | null)[];
  readonly customOnly?: boolean;
};

export type SearchOptions = SearchFilters & {
  readonly limit?: number;
};

/** Longer prefixes than this fall back to a full-token check when scoring. */
const MAX_PREFIX = 16;

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
}

export function buildSearchIndex(entries: readonly Exercise[]): SearchIndex {
  const byPrefix = new Map<string, number[]>();

  entries.forEach((entry, index) => {
    for (const token of tokenize(entry.name)) {
      const upto = Math.min(token.length, MAX_PREFIX);
      for (let length = 1; length <= upto; length += 1) {
        const prefix = token.slice(0, length);
        const bucket = byPrefix.get(prefix);
        if (bucket === undefined) {
          byPrefix.set(prefix, [index]);
        } else if (bucket[bucket.length - 1] !== index) {
          // Entries are visited in order, so a repeated token in the same name
          // only ever appends the index already at the tail.
          bucket.push(index);
        }
      }
    }
  });

  return { entries, byPrefix };
}

function matchesFilters(entry: Exercise, filters: SearchFilters): boolean {
  if (filters.customOnly === true && !entry.isCustom) return false;

  const muscles = filters.muscles;
  if (muscles !== undefined && muscles.length > 0) {
    const primaryOnly = filters.musclesPrimaryOnly === true;
    const hit = muscles.some(
      (muscle) =>
        entry.primaryMuscles.includes(muscle) ||
        (!primaryOnly && entry.secondaryMuscles.includes(muscle)),
    );
    if (!hit) return false;
  }

  const equipment = filters.equipment;
  if (equipment !== undefined && equipment.length > 0 && !equipment.includes(entry.equipment)) {
    return false;
  }

  return true;
}

/**
 * Scores a name against the query tokens. Higher is better; 0 means no match.
 * Ordering intent: an exact name beats a name that starts with the query,
 * which beats a match on a later word.
 */
export function scoreName(name: string, queryTokens: readonly string[]): number {
  if (queryTokens.length === 0) return 1;

  const lower = name.toLowerCase();
  const nameTokens = tokenize(name);
  let score = 0;

  for (const queryToken of queryTokens) {
    const position = nameTokens.findIndex((token) => token.startsWith(queryToken));
    if (position === -1) return 0;
    // Earlier words matter more, and a whole-word hit beats a partial one.
    score += 100 - Math.min(position, 9) * 8;
    if (nameTokens[position] === queryToken) score += 20;
  }

  if (lower === queryTokens.join(' ')) score += 1000;
  else if (lower.startsWith(queryTokens.join(' '))) score += 300;

  return score;
}

/** Candidate indices for the rarest query token, or null to scan everything. */
function candidates(index: SearchIndex, queryTokens: readonly string[]): readonly number[] | null {
  if (queryTokens.length === 0) return null;

  let smallest: readonly number[] | null = null;
  for (const token of queryTokens) {
    const bucket = index.byPrefix.get(token.slice(0, MAX_PREFIX));
    if (bucket === undefined) return [];
    if (smallest === null || bucket.length < smallest.length) smallest = bucket;
  }
  return smallest;
}

export function search(
  index: SearchIndex,
  query: string,
  options: SearchOptions = {},
): readonly Exercise[] {
  const queryTokens = tokenize(query);
  const pool = candidates(index, queryTokens);
  const limit = options.limit ?? Number.POSITIVE_INFINITY;

  const scored: { entry: Exercise; score: number }[] = [];
  const consider = (entry: Exercise): void => {
    if (!matchesFilters(entry, options)) return;
    const score = scoreName(entry.name, queryTokens);
    if (score > 0) scored.push({ entry, score });
  };

  if (pool === null) {
    for (const entry of index.entries) consider(entry);
  } else {
    for (const position of pool) {
      const entry = index.entries[position];
      if (entry !== undefined) consider(entry);
    }
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.entry.isCustom !== b.entry.isCustom) return a.entry.isCustom ? -1 : 1;
    return a.entry.name.localeCompare(b.entry.name, 'en', { sensitivity: 'base' });
  });

  const results = scored.map(({ entry }) => entry);
  return Number.isFinite(limit) ? results.slice(0, limit) : results;
}
