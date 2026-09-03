import type { CatalogExercise, ExerciseDetails } from '@/domain/exercises';
import { parseCatalogExercise, parseExerciseDetails } from '@/domain/exercises';
import detailsUrl from './generated/details.json?url';
import coreUrl from './generated/exercises.json?url';

/**
 * Loads the vendored catalog (§2.2).
 *
 * Both files are imported as `?url` rather than as JSON modules, on purpose:
 *
 * - They stay separate hashed assets instead of being inlined into a JS chunk,
 *   so the service worker precaches them and a cold offline start can still
 *   search and add an exercise mid-session.
 * - TypeScript never has to infer a literal type for an 876-element array,
 *   which would make `tsc` crawl for no benefit.
 *
 * The trade-off is that the fetched value is untrusted at the type level, so
 * it goes through the same validator the build script used.
 */

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load the ${label} (${String(response.status)})`);
  }
  return response.json();
}

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
  corePromise ??= fetchJson(coreUrl, 'exercise catalog')
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
  detailsPromise ??= fetchJson(detailsUrl, 'exercise instructions')
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
