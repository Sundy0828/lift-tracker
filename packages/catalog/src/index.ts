import type { CatalogExercise, ExerciseDetails } from '@lift/domain/exercises';
import { parseCatalogExercise, parseExerciseDetails } from '@lift/domain/exercises';
import { readCoreJson, readDetailsJson } from './source';

/**
 * Loads the vendored catalog (§2.2). Where the bytes come from is per
 * platform (see `./source`); parsing and memoising are shared.
 */

function asRecords(value: unknown, label: string): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`Malformed ${label}: expected an array`);
  return value as readonly Record<string, unknown>[];
}

let corePromise: Promise<readonly CatalogExercise[]> | null = null;

/**
 * The searchable core (~19 kB gzipped), memoised for the session. Safe to
 * call from anywhere; concurrent callers share one request.
 */
export function loadCatalog(): Promise<readonly CatalogExercise[]> {
  corePromise ??= readCoreJson()
    .then((value) => {
      const parsed: CatalogExercise[] = [];
      for (const raw of asRecords(value, 'exercise catalog')) {
        const entry = parseCatalogExercise(raw);
        if (entry !== null) parsed.push(entry);
      }
      if (parsed.length === 0) throw new Error('Exercise catalog loaded but contained no entries');
      return parsed;
    })
    .catch((error: unknown) => {
      // Clear the memo so a transient failure can be retried.
      corePromise = null;
      throw error;
    });
  return corePromise;
}

let detailsPromise: Promise<ReadonlyMap<string, ExerciseDetails>> | null = null;

/**
 * Instructions and image paths, ~140 kB gzipped for all 876 exercises. Loaded
 * only when an exercise detail view is opened — never on the search path.
 * One request for the whole file beats 876 per-exercise requests.
 */
export function loadExerciseDetails(): Promise<ReadonlyMap<string, ExerciseDetails>> {
  detailsPromise ??= readDetailsJson()
    .then((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Malformed exercise instructions: expected an object');
      }
      const map = new Map<string, ExerciseDetails>();
      for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
        if (typeof raw === 'object' && raw !== null) {
          map.set(id, parseExerciseDetails(raw as Record<string, unknown>));
        }
      }
      return map;
    })
    .catch((error: unknown) => {
      detailsPromise = null;
      throw error;
    });
  return detailsPromise;
}
