import type { MuscleGroup } from './muscles';
import { parseMuscleGroups } from './muscles';

/** free-exercise-db's own vocabularies, used verbatim. */
export const EQUIPMENT = [
  'bands',
  'barbell',
  'body only',
  'cable',
  'dumbbell',
  'e-z curl bar',
  'exercise ball',
  'foam roll',
  'kettlebells',
  'machine',
  'medicine ball',
  'other',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_CATEGORIES = [
  'cardio',
  'olympic weightlifting',
  'plyometrics',
  'powerlifting',
  'strength',
  'stretching',
  'strongman',
] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const FORCES = ['push', 'pull', 'static'] as const;
export type Force = (typeof FORCES)[number];

export const LEVELS = ['beginner', 'intermediate', 'expert'] as const;
export type Level = (typeof LEVELS)[number];

export const MECHANICS = ['compound', 'isolation'] as const;
export type Mechanic = (typeof MECHANICS)[number];

/**
 * The searchable core of a bundled catalog entry. `instructions` and `images`
 * are deliberately absent: they are ~70% of the raw data and are needed only
 * when one exercise is opened, so the build script splits them into a lazily
 * loaded side file (§2.2). See `ExerciseDetails`.
 */
export type CatalogExercise = {
  id: string;
  name: string;
  force: Force | null;
  level: Level;
  mechanic: Mechanic | null;
  equipment: Equipment | null;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  category: ExerciseCategory;
};

/** The heavy half of a catalog entry, fetched on demand per exercise. */
export type ExerciseDetails = {
  instructions: string[];
  /** Paths relative to `EXERCISE_IMAGE_BASE`. Remote, so online-only. */
  images: string[];
};

/** A user-defined exercise at `users/{uid}/customExercises/{id}`. */
export type CustomExercise = {
  id: string;
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment | null;
  isCustom: true;
  /** ISO-8601 instant, or null before the server timestamp lands. */
  createdAt: string | null;
};

/**
 * The single exercise shape the UI consumes, whichever source it came from.
 * Catalog-only fields are null on a custom exercise.
 */
export type Exercise = {
  id: string;
  name: string;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
  equipment: Equipment | null;
  isCustom: boolean;
  force: Force | null;
  level: Level | null;
  mechanic: Mechanic | null;
  category: ExerciseCategory | null;
};

export const EXERCISE_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

/**
 * Image URLs for a catalog exercise, derived from its id rather than stored.
 *
 * free-exercise-db names every image `{id}/0.jpg` and `{id}/1.jpg` — the start
 * and end position of the movement — which `exercises.test.ts` asserts against
 * the committed data for all 873 exercises that have images. Deriving them
 * keeps the searchable core at 19 kB instead of carrying 876 path pairs.
 *
 * Three exercises have no images and a handful may 404 after an upstream
 * change, so callers must handle a failed load. The images are also remote, so
 * they need network on first view; the service worker caches them after that.
 */
export function catalogImageUrls(exercise: Exercise): string[] {
  // Custom exercises have no bundled imagery.
  if (exercise.isCustom) return [];
  return [
    `${EXERCISE_IMAGE_BASE}${exercise.id}/0.jpg`,
    `${EXERCISE_IMAGE_BASE}${exercise.id}/1.jpg`,
  ];
}

export function isEquipment(value: unknown): value is Equipment {
  return typeof value === 'string' && (EQUIPMENT as readonly string[]).includes(value);
}

export function isForce(value: unknown): value is Force {
  return typeof value === 'string' && (FORCES as readonly string[]).includes(value);
}

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function isMechanic(value: unknown): value is Mechanic {
  return typeof value === 'string' && (MECHANICS as readonly string[]).includes(value);
}

export function isExerciseCategory(value: unknown): value is ExerciseCategory {
  return typeof value === 'string' && (EXERCISE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Prefix on every custom-exercise id, so a reference can be classified without
 * a lookup.
 *
 * That matters for sharing (§2.9): a share payload has to inline the full
 * definition of every *custom* exercise it uses and reference catalog ones by
 * id alone, and the recipient has no way to resolve the sender's ids. The
 * prefix is what makes "is this mine to inline?" a decidable question.
 */
export const CUSTOM_ID_PREFIX = 'custom_';

export function isCustomExerciseId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

/**
 * The key custom exercises are deduped on when importing a share.
 *
 * Case and surrounding space only. Nothing cleverer on purpose: collapsing
 * "DB Bench" into "Dumbbell Bench Press" would be a guess about the sender's
 * intent, and merging two exercises that are not the same silently corrupts
 * the importer's history.
 */
export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function fromCatalog(entry: CatalogExercise): Exercise {
  return {
    id: entry.id,
    name: entry.name,
    primaryMuscles: entry.primaryMuscles,
    secondaryMuscles: entry.secondaryMuscles,
    equipment: entry.equipment,
    isCustom: false,
    force: entry.force,
    level: entry.level,
    mechanic: entry.mechanic,
    category: entry.category,
  };
}

export function fromCustom(entry: CustomExercise): Exercise {
  return {
    id: entry.id,
    name: entry.name,
    primaryMuscles: entry.primaryMuscles,
    secondaryMuscles: entry.secondaryMuscles,
    equipment: entry.equipment,
    isCustom: true,
    force: null,
    level: null,
    mechanic: null,
    category: null,
  };
}

export type ExerciseResolver = {
  /** null when the id is unknown — a deleted custom exercise, say. */
  resolve: (id: string) => Exercise | null;
  /** Custom exercises first, then the catalog; both name-sorted. */
  all: () => readonly Exercise[];
};

/**
 * Resolves an exercise reference by checking custom exercises first, then the
 * bundled catalog (§2.2), so a custom entry can shadow a catalog one and the
 * UI only ever handles a single `Exercise` type.
 */
export function createExerciseResolver(
  catalog: readonly CatalogExercise[],
  custom: readonly CustomExercise[],
): ExerciseResolver {
  const byId = new Map<string, Exercise>();
  for (const entry of catalog) {
    byId.set(entry.id, fromCatalog(entry));
  }
  // Written second so a custom exercise wins on an id collision.
  for (const entry of custom) {
    byId.set(entry.id, fromCustom(entry));
  }

  const all = [...byId.values()].sort(compareExercises);

  return {
    resolve: (id) => byId.get(id) ?? null,
    all: () => all,
  };
}

/** Custom exercises sort ahead of catalog entries, then by name. */
export function compareExercises(a: Exercise, b: Exercise): number {
  if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

export function equipmentLabel(equipment: Equipment | null): string {
  return equipment ?? 'Unspecified';
}

/**
 * Narrows one raw catalog record. Returns null rather than guessing when a
 * required field is unusable, so a bad record is dropped loudly at build time
 * instead of rendering as a half-empty row.
 *
 * Shared deliberately: `scripts/build-catalog.ts` validates with this when it
 * vendors the data, and `src/catalog` validates with it again when loading the
 * committed file. One validator, so the two can never drift.
 */
export function parseCatalogExercise(raw: Record<string, unknown>): CatalogExercise | null {
  const id: unknown = raw['id'];
  const name: unknown = raw['name'];
  const level: unknown = raw['level'];
  const category: unknown = raw['category'];

  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof name !== 'string' || name.length === 0) return null;
  if (!isLevel(level) || !isExerciseCategory(category)) return null;

  const primaryMuscles = parseMuscleGroups(raw['primaryMuscles']);
  if (primaryMuscles.length === 0) return null;

  const force: unknown = raw['force'];
  const mechanic: unknown = raw['mechanic'];
  const equipment: unknown = raw['equipment'];

  return {
    id,
    name,
    force: isForce(force) ? force : null,
    level,
    mechanic: isMechanic(mechanic) ? mechanic : null,
    equipment: isEquipment(equipment) ? equipment : null,
    primaryMuscles,
    secondaryMuscles: parseMuscleGroups(raw['secondaryMuscles']),
    category,
  };
}

/** Narrows the `instructions` / `images` half of a catalog record. */
export function parseExerciseDetails(raw: Record<string, unknown>): ExerciseDetails {
  return {
    instructions: parseStringArray(raw['instructions']),
    images: parseStringArray(raw['images']),
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).filter((item): item is string => typeof item === 'string');
}

/** Narrows an untrusted custom-exercise record (from Firestore or a share). */
export function parseCustomExercise(id: string, data: Record<string, unknown>): CustomExercise {
  const name: unknown = data['name'];
  const equipment: unknown = data['equipment'];
  const createdAt: unknown = data['createdAt'];

  return {
    id,
    name: typeof name === 'string' ? name : '',
    primaryMuscles: parseMuscleGroups(data['primaryMuscles']),
    secondaryMuscles: parseMuscleGroups(data['secondaryMuscles']),
    equipment: isEquipment(equipment) ? equipment : null,
    isCustom: true,
    createdAt: typeof createdAt === 'string' ? createdAt : null,
  };
}
