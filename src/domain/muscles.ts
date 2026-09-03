/**
 * free-exercise-db's muscle vocabulary, used verbatim (§2.3) so no mapping
 * layer is needed between the bundled catalog and the app.
 */
export const MUSCLE_GROUPS = [
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

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === 'string' && (MUSCLE_GROUPS as readonly string[]).includes(value);
}

/** Keeps only the recognised muscle names from untrusted input. */
export function parseMuscleGroups(value: unknown): MuscleGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<MuscleGroup>();
  for (const item of value as readonly unknown[]) {
    if (isMuscleGroup(item)) seen.add(item);
  }
  return [...seen];
}

export type MuscleRegion = {
  readonly name: string;
  readonly muscles: readonly MuscleGroup[];
};

/**
 * Display grouping only — never used for volume math. Every muscle group
 * belongs to exactly one region, which `muscles.test.ts` enforces.
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
};

export function muscleLabel(muscle: MuscleGroup): string {
  return LABELS[muscle];
}

export function regionOf(muscle: MuscleGroup): string | null {
  return MUSCLE_REGIONS.find((region) => region.muscles.includes(muscle))?.name ?? null;
}
