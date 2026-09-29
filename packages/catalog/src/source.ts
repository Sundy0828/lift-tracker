import detailsUrl from './generated/details.json?url';
import coreUrl from './generated/exercises.json?url';

/**
 * Where the catalog's raw JSON comes from, per platform. This is the web
 * version: Metro picks a \`source.native.ts\` beside it on mobile, where the
 * JSON ships inside the app bundle instead.
 *
 * Both files are imported as `?url` rather than as JSON modules, on purpose:
 *
 * - They stay separate hashed assets instead of being inlined into a JS chunk,
 *   so the service worker precaches them and a cold offline start can still
 *   search and add an exercise mid-session.
 * - TypeScript never has to infer a literal type for an 876-element array,
 *   which would make `tsc` crawl for no benefit.
 *
 * The value is untrusted at the type level either way, so `index.ts` runs it
 * through the same validator the build script used.
 */

async function fetchJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load the ${label} (${String(response.status)})`);
  }
  return response.json();
}

/** The searchable core, `generated/exercises.json`. */
export function readCoreJson(): Promise<unknown> {
  return fetchJson(coreUrl, 'exercise catalog');
}

/** Instructions and image paths, `generated/details.json`. */
export function readDetailsJson(): Promise<unknown> {
  return fetchJson(detailsUrl, 'exercise instructions');
}
