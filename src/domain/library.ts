import { tokenize } from './search';
import type { SharedWorkout } from './sharing';
import type { ExerciseSlot, WorkoutBody } from './workouts';
import { exerciseSlots, parseGroupRest, parseSlots, totalSets } from './workouts';

/**
 * The global workout library: workouts published for everyone, read-only.
 *
 * It is a **seeded, browse-and-import** library (IDEAS §3). There is no
 * submission path and no review queue, because moderation is a product rather
 * than a checkbox — and the browse half is most of the value for a fraction of
 * the work. Rules make the collection world-readable and refuse every write.
 *
 * A library workout carries **catalog exercise ids only**. Every copy of the
 * app bundles the same catalog, so an import needs no custom-exercise
 * definitions to come with it, and `asShared` below can hand the existing
 * import machinery a payload with none.
 */

export const LIBRARY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type LibraryLevel = (typeof LIBRARY_LEVELS)[number];

export type LibraryWorkout = {
  id: string;
  name: string;
  /** One line, shown under the name in the list. */
  summary: string;
  level: LibraryLevel;
  /** How many of these a week the program assumes. Null when it does not say. */
  daysPerWeek: number | null;
  /** Free text, for the filter chips: `push-pull-legs`, `dumbbell-only`. */
  tags: string[];
  /** Equipment named for the list, not derived — it is a promise to the reader. */
  equipment: string[];
  slots: ExerciseSlot[];
  groupRest: Record<string, number | null>;
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const found: string[] = [];
  for (const raw of value as readonly unknown[]) {
    if (typeof raw === 'string' && raw !== '' && !found.includes(raw)) found.push(raw);
  }
  return found;
}

function asLevel(value: unknown): LibraryLevel {
  return typeof value === 'string' && (LIBRARY_LEVELS as readonly string[]).includes(value)
    ? (value as LibraryLevel)
    : 'intermediate';
}

/**
 * Narrows a library document. Returns null when there is nothing to import —
 * no name, or no exercise in it.
 */
export function parseLibraryWorkout(
  id: string,
  data: Record<string, unknown> | undefined,
): LibraryWorkout | null {
  if (data === undefined) return null;

  const name = asString(data['name']).trim();
  const slots = parseSlots(data['slots']);
  if (name === '' || exerciseSlots(slots).length === 0) return null;

  const daysPerWeek: unknown = data['daysPerWeek'];

  return {
    id,
    name,
    summary: asString(data['summary']),
    level: asLevel(data['level']),
    daysPerWeek:
      typeof daysPerWeek === 'number' && Number.isFinite(daysPerWeek)
        ? Math.max(1, Math.min(7, Math.round(daysPerWeek)))
        : null,
    tags: asStrings(data['tags']),
    equipment: asStrings(data['equipment']),
    slots,
    groupRest: parseGroupRest(data['groupRest']),
  };
}

export function libraryBody(entry: LibraryWorkout): WorkoutBody {
  return { name: entry.name, slots: entry.slots, groupRest: entry.groupRest };
}

/**
 * A library entry in the shape the share importer already takes.
 *
 * Importing from the library and importing from a link are the same operation
 * — a body plus the definitions it needs — so they run the same code. The
 * owner is empty because nobody owns a library entry, and `planImport` never
 * reads it.
 */
export function asShared(entry: LibraryWorkout): SharedWorkout {
  return {
    shareId: `library:${entry.id}`,
    ownerUid: '',
    toUid: null,
    sourceWorkoutId: entry.id,
    versionNumber: 1,
    body: libraryBody(entry),
    customExercises: [],
    revoked: false,
    createdAt: null,
  };
}

/** Every tag in use, most common first, for the filter row. */
export function libraryTags(entries: readonly LibraryWorkout[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([aTag, a], [bTag, b]) => b - a || aTag.localeCompare(bTag))
    .map(([tag]) => tag);
}

export type LibraryFilter = {
  query: string;
  /** Null is every tag. */
  tag: string | null;
  /** Null is every level. */
  level: LibraryLevel | null;
};

export const NO_FILTER: LibraryFilter = { query: '', tag: null, level: null };

/**
 * The library, filtered and sorted for the browse list.
 *
 * Search covers the name, the summary and the tags — the three things a reader
 * has in mind — and tokenises both sides the way the exercise search does, so
 * `push pull` matches `Push / Pull / Legs` and punctuation never blocks a hit.
 */
export function filterLibrary(
  entries: readonly LibraryWorkout[],
  filter: LibraryFilter,
): LibraryWorkout[] {
  const wanted = tokenize(filter.query);

  return entries
    .filter((entry) => {
      if (filter.tag !== null && !entry.tags.includes(filter.tag)) return false;
      if (filter.level !== null && entry.level !== filter.level) return false;
      if (wanted.length === 0) return true;

      const haystack = tokenize(`${entry.name} ${entry.summary} ${entry.tags.join(' ')}`);
      return wanted.every((token) => haystack.some((word) => word.startsWith(token)));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** `8 exercises · 24 sets` — what the list row says about a workout's size. */
export function describeSize(entry: LibraryWorkout): string {
  const exercises = exerciseSlots(entry.slots).length;
  const sets = totalSets(libraryBody(entry));
  return `${String(exercises)} ${exercises === 1 ? 'exercise' : 'exercises'} · ${String(sets)} sets`;
}
