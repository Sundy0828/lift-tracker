/**
 * Vendors free-exercise-db into `src/catalog/generated` (§2.2).
 *
 * The catalog is bundled at build time rather than fetched at runtime so that
 * search-as-you-type runs against a local index — no round trip per keystroke,
 * no API key, no CORS, no rate limit, no third-party uptime dependency.
 * Offline resilience is a free side effect.
 *
 * Emits three files, all committed:
 *   exercises.json  the searchable core, one array
 *   details.json    instructions + image paths, keyed by id (loaded on demand)
 *   meta.json       provenance and counts
 *
 * Run with `npm run catalog:update`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogExercise, ExerciseDetails } from '@/domain/exercises';
import { parseCatalogExercise, parseExerciseDetails } from '@/domain/exercises';
import { parseBaseMuscleGroups } from '@/domain/muscles';
import { REFINEMENTS, refineMuscles } from './catalog-refinements';

const SOURCE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const LICENSE = 'Unlicense (public domain)';
const OUT_DIR = fileURLToPath(new URL('../src/catalog/generated/', import.meta.url));

type RawExercise = Record<string, unknown>;

async function main(): Promise<void> {
  console.log(`fetching ${SOURCE}`);
  const response = await fetch(SOURCE);
  if (!response.ok) {
    throw new Error(`fetch failed: ${String(response.status)} ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('expected a JSON array at the top level');

  const core: CatalogExercise[] = [];
  const details: Record<string, ExerciseDetails> = {};
  const rejected: string[] = [];

  for (const raw of payload as readonly RawExercise[]) {
    const entry = parseCatalogExercise(raw);
    if (entry === null) {
      const label: unknown = raw['id'] ?? raw['name'];
      rejected.push(typeof label === 'string' ? label : '<unidentified>');
      continue;
    }
    if (entry.id in details) {
      rejected.push(`${entry.id} (duplicate id)`);
      continue;
    }
    core.push({
      ...entry,
      primaryMuscles: refineMuscles(entry.name, entry.primaryMuscles),
      secondaryMuscles: refineMuscles(entry.name, entry.secondaryMuscles),
    });
    details[entry.id] = parseExerciseDetails(raw);
  }

  // Sorted so the committed files have a stable diff between refreshes.
  core.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const sortedDetails = Object.fromEntries(
    Object.keys(details)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((key) => [key, details[key]]),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  write('exercises.json', core);
  write('details.json', sortedDetails);
  write('meta.json', {
    source: SOURCE,
    license: LICENSE,
    count: core.length,
    rejected: rejected.length,
  });

  console.log(`\n${String(core.length)} exercises written, ${String(rejected.length)} rejected`);
  for (const id of rejected) console.log(`  rejected: ${id}`);

  reportRefinements(core);
  reportUnknownUpstreamMuscles(payload as readonly RawExercise[]);
}

/**
 * Fails the refresh if a curated rule stopped matching. Without this a rule
 * could silently go stale after an upstream rename and quietly stop refining.
 */
function reportRefinements(core: readonly CatalogExercise[]): void {
  console.log('\nmuscle refinements applied:');
  const stale: string[] = [];

  for (const rule of REFINEMENTS) {
    const hits = core.filter(
      (entry) => entry.primaryMuscles.includes(rule.to) || entry.secondaryMuscles.includes(rule.to),
    ).length;

    const ok = hits >= rule.expectAtLeast;
    if (!ok) stale.push(`${rule.from} -> ${rule.to}`);
    console.log(
      `  ${rule.from} -> ${rule.to}: ${String(hits)} exercises` +
        ` (expected >= ${String(rule.expectAtLeast)})${ok ? '' : '  STALE'}`,
    );
  }

  if (stale.length > 0) {
    throw new Error(
      `Refinement rules matched fewer exercises than expected (${stale.join(', ')}). ` +
        'Upstream names may have changed — review scripts/catalog-refinements.ts.',
    );
  }
}

/** Surfaces any muscle name upstream uses that the base vocabulary lacks. */
function reportUnknownUpstreamMuscles(payload: readonly RawExercise[]): void {
  const unknown = new Set<string>();

  for (const raw of payload) {
    for (const key of ['primaryMuscles', 'secondaryMuscles'] as const) {
      const value: unknown = raw[key];
      if (!Array.isArray(value)) continue;
      const known = new Set<string>(parseBaseMuscleGroups(value));
      for (const item of value as readonly unknown[]) {
        if (typeof item === 'string' && !known.has(item)) unknown.add(item);
      }
    }
  }

  if (unknown.size > 0) {
    console.log(
      `\nWARNING: upstream uses muscle names the domain does not know: ${[...unknown].join(', ')}`,
    );
  }
}

function write(name: string, value: unknown): void {
  // Minified: these are generated data files, never read by hand, and the
  // whitespace would be ~30% of the bundled bytes.
  const json = JSON.stringify(value);
  writeFileSync(join(OUT_DIR, name), `${json}\n`, 'utf8');
  console.log(`  ${name}: ${(json.length / 1024).toFixed(1)} kB raw`);
}

await main();
