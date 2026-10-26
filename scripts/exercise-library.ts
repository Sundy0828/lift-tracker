/**
 * The exercise library for scripts run under node.
 *
 * The app loads the catalog through `@lift/catalog`, which imports its JSON as
 * a bundler `?url` asset that node cannot resolve. The records code needs the
 * library for one thing — each exercise's `LoadScale`, from its equipment —
 * so this reads the same committed file from disk, runs it through the same
 * validator, and merges custom exercises over it exactly as the app's
 * resolver does (`createExerciseResolver`). One rule, so a script can never
 * score a lift differently from the app.
 *
 * Not a script itself: imported by `seed-history`, `negate-assisted` and
 * `rebuild-records`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CatalogExercise, CustomExercise, ExerciseResolver } from '@lift/domain/exercises';
import { createExerciseResolver, parseCatalogExercise } from '@lift/domain/exercises';

const CATALOG = new URL('../packages/catalog/src/generated/exercises.json', import.meta.url);

let catalog: readonly CatalogExercise[] | null = null;

/** The vendored catalog, read once. Throws if the file is missing or empty. */
export function catalogFromDisk(): readonly CatalogExercise[] {
  if (catalog !== null) return catalog;

  const raw: unknown = JSON.parse(readFileSync(fileURLToPath(CATALOG), 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Malformed exercise catalog: expected an array');

  const parsed: CatalogExercise[] = [];
  for (const record of raw as readonly Record<string, unknown>[]) {
    const entry = parseCatalogExercise(record);
    if (entry !== null) parsed.push(entry);
  }
  if (parsed.length === 0) throw new Error('Exercise catalog loaded but contained no entries');

  catalog = parsed;
  return parsed;
}

/**
 * The catalog with one account's custom exercises over it. Pass `[]` for an
 * account that has none (the seeded history uses catalog lifts only).
 */
export function exerciseResolver(custom: readonly CustomExercise[]): ExerciseResolver {
  return createExerciseResolver(catalogFromDisk(), custom);
}
