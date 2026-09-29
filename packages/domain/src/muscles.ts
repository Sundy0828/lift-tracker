/**
 * The muscle vocabulary, in two tiers.
 *
 * **Base groups** are free-exercise-db's 17 names, used verbatim (§2.3). They
 * are the only names the *upstream* catalog is parsed with, so refreshing the
 * vendored data never needs a translation step, and they are the granularity
 * the muscle map draws — one SVG path per base group.
 *
 * **Extensions** are finer muscles the source vocabulary lacks, each declaring
 * a base group as its parent. They exist because the source buckets are too
 * coarse to train against: `shoulders` covers 129 exercises including every
 * rear-delt movement, so a workout tagged only with base names cannot reveal the
 * most common imbalance there is.
 *
 * Because every extension rolls up to a base group, adding them costs the map
 * nothing: `baseMuscleOf` resolves any muscle to a paintable region, so volume
 * math can track `rear delts` precisely while the diagram still shades
 * `shoulders`.
 */

/** free-exercise-db's vocabulary, verbatim. Never reorder or rename. */
export const BASE_MUSCLE_GROUPS = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export type BaseMuscleGroup = (typeof BASE_MUSCLE_GROUPS)[number];

/**
 * Extension -> parent base group. The parent is what the muscle map paints and
 * what volume totals roll up into, so it must be the region the muscle
 * visually belongs to rather than the strictest anatomical grouping.
 */
export const MUSCLE_EXTENSIONS = {
  'front delts': 'shoulders',
  'side delts': 'shoulders',
  'rear delts': 'shoulders',
  'upper chest': 'chest',
  obliques: 'abdominals',
  brachialis: 'biceps',
  soleus: 'calves',
  // Tibialis anterior is the calves' antagonist, not part of them. It parents
  // to `calves` only because that is the lower-leg region on the diagram;
  // volume tracking keeps the two separate, which is the point.
  tibialis: 'calves',
  rhomboids: 'middle back',
  // Rectus femoris is both a quad and a hip flexor, and the front of the hip
  // is the nearest paintable region.
  'hip flexors': 'quadriceps',
} as const satisfies Record<string, BaseMuscleGroup>;

export type ExtendedMuscleGroup = keyof typeof MUSCLE_EXTENSIONS;

export const EXTENDED_MUSCLE_GROUPS: readonly ExtendedMuscleGroup[] = Object.keys(
  MUSCLE_EXTENSIONS,
) as ExtendedMuscleGroup[];

export type MuscleGroup = BaseMuscleGroup | ExtendedMuscleGroup;

/** Base groups first, then extensions. */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  ...BASE_MUSCLE_GROUPS,
  ...EXTENDED_MUSCLE_GROUPS,
];

export function isBaseMuscleGroup(value: unknown): value is BaseMuscleGroup {
  return typeof value === 'string' && (BASE_MUSCLE_GROUPS as readonly string[]).includes(value);
}

export function isExtendedMuscleGroup(value: unknown): value is ExtendedMuscleGroup {
  return typeof value === 'string' && value in MUSCLE_EXTENSIONS;
}

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return isBaseMuscleGroup(value) || isExtendedMuscleGroup(value);
}

/**
 * Resolves any muscle to the base group the map can paint and volume totals
 * roll into. A base group resolves to itself, so this is safe to call on
 * anything and guarantees the map never has a muscle it cannot draw.
 */
export function baseMuscleOf(muscle: MuscleGroup): BaseMuscleGroup {
  return isExtendedMuscleGroup(muscle) ? MUSCLE_EXTENSIONS[muscle] : muscle;
}

/** Keeps only recognised muscle names, base or extended, from untrusted input. */
export function parseMuscleGroups(value: unknown): MuscleGroup[] {
  return keepKnown(value, isMuscleGroup);
}

/**
 * Base-only variant, used when parsing the *upstream* catalog: the source data
 * may only ever contain its own vocabulary, so an unexpected name is dropped
 * rather than silently accepted.
 */
export function parseBaseMuscleGroups(value: unknown): BaseMuscleGroup[] {
  return keepKnown(value, isBaseMuscleGroup);
}

function keepKnown<T extends MuscleGroup>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const item of value as readonly unknown[]) {
    if (predicate(item)) seen.add(item);
  }
  return [...seen];
}

export type MuscleRegion = {
  readonly name: string;
  readonly muscles: readonly BaseMuscleGroup[];
};

/**
 * Display grouping only — never used for volume math. Covers the base groups;
 * an extension's region comes from its parent via {@link regionOf}. Every base
 * group belongs to exactly one region, which `muscles.test.ts` enforces.
 */
export const MUSCLE_REGIONS: readonly MuscleRegion[] = [
  { name: 'Chest', muscles: ['chest'] },
  { name: 'Back', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
  { name: 'Shoulders', muscles: ['shoulders', 'neck'] },
  { name: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { name: 'Core', muscles: ['abdominals'] },
  {
    name: 'Legs',
    muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'],
  },
];

const LABELS: Record<MuscleGroup, string> = {
  abdominals: 'Abs',
  abductors: 'Abductors',
  adductors: 'Adductors',
  biceps: 'Biceps',
  calves: 'Calves',
  chest: 'Chest',
  forearms: 'Forearms',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  lats: 'Lats',
  'lower back': 'Lower back',
  'middle back': 'Mid back',
  neck: 'Neck',
  quadriceps: 'Quads',
  shoulders: 'Shoulders',
  traps: 'Traps',
  triceps: 'Triceps',
  'front delts': 'Front delts',
  'side delts': 'Side delts',
  'rear delts': 'Rear delts',
  'upper chest': 'Upper chest',
  obliques: 'Obliques',
  brachialis: 'Brachialis',
  soleus: 'Soleus',
  tibialis: 'Tibialis',
  rhomboids: 'Rhomboids',
  'hip flexors': 'Hip flexors',
};

export function muscleLabel(muscle: MuscleGroup): string {
  return LABELS[muscle];
}

/** The display region for any muscle, resolved through its base group. */
export function regionOf(muscle: MuscleGroup): string | null {
  const base = baseMuscleOf(muscle);
  return MUSCLE_REGIONS.find((region) => region.muscles.includes(base))?.name ?? null;
}

/**
 * Every muscle group in each display region. Extensions sit under their
 * parent's region, so "Rear delts" belongs to "Shoulders".
 *
 * A region filter needs the whole list, not the region's base groups: an
 * exercise tagged only "rear delts" must still match Shoulders.
 */
export const MUSCLE_GROUPS_BY_REGION: readonly {
  readonly region: string;
  readonly muscles: readonly MuscleGroup[];
}[] = MUSCLE_REGIONS.map((region) => ({
  region: region.name,
  muscles: MUSCLE_GROUPS.filter((muscle) => region.muscles.includes(baseMuscleOf(muscle))),
}));

/**
 * Muscle options grouped by display region, for pickers. Extensions appear
 * under their parent's region, so "Rear delts" sits with "Shoulders".
 */
// Mutable member arrays on purpose: this feeds Mantine's `ComboboxData`,
// whose prop type does not accept readonly arrays.
export const MUSCLE_OPTIONS_BY_REGION: {
  group: string;
  items: { value: MuscleGroup; label: string }[];
}[] = MUSCLE_GROUPS_BY_REGION.map(({ region, muscles }) => ({
  group: region,
  items: muscles.map((muscle) => ({ value: muscle, label: muscleLabel(muscle) })),
}));
