import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CatalogExercise, ExerciseDetails } from '@/domain/exercises';
import { fromCatalog, parseCatalogExercise } from '@/domain/exercises';
import { MUSCLE_GROUPS } from '@/domain/muscles';
import { buildSearchIndex, search } from '@/domain/search';

/**
 * Validates the *committed* generated catalog, not the generator. This is what
 * catches a bad `npm run catalog:update`: if upstream changes shape or adds a
 * muscle name the domain does not know, this fails rather than the app
 * silently rendering half-empty rows.
 */

function readGenerated(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'generated', name), 'utf8'));
}

const raw = readGenerated('exercises.json') as readonly Record<string, unknown>[];
const details = readGenerated('details.json') as Record<string, ExerciseDetails>;
const meta = readGenerated('meta.json') as { count: number; source: string; license: string };

describe('generated catalog', () => {
  it('bundles the 800+ exercises the plan calls for', () => {
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThan(800);
    expect(raw.length).toBe(meta.count);
  });

  it('records its provenance and public-domain licence', () => {
    expect(meta.source).toContain('free-exercise-db');
    expect(meta.license).toContain('Unlicense');
  });

  it('has every entry pass the domain validator unchanged', () => {
    const rejected: unknown[] = [];
    const changed: string[] = [];

    for (const entry of raw) {
      const parsed = parseCatalogExercise(entry);
      if (parsed === null) {
        rejected.push(entry['id'] ?? entry);
        continue;
      }
      // Committed data should already be canonical: parsing is a no-op.
      if (JSON.stringify(parsed) !== JSON.stringify(entry)) changed.push(parsed.id);
    }

    expect(rejected).toEqual([]);
    expect(changed).toEqual([]);
  });

  it('has unique, non-empty ids', () => {
    const ids = raw.map((entry) => entry['id']);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only muscle names the domain knows', () => {
    const known = new Set<string>(MUSCLE_GROUPS);
    const unknown = new Set<string>();

    for (const entry of raw) {
      for (const key of ['primaryMuscles', 'secondaryMuscles']) {
        for (const muscle of entry[key] as readonly string[]) {
          if (!known.has(muscle)) unknown.add(muscle);
        }
      }
    }

    expect([...unknown]).toEqual([]);
  });

  it('gives every exercise at least one primary muscle', () => {
    const missing = raw.filter(
      (entry) => (entry['primaryMuscles'] as readonly string[]).length === 0,
    );
    expect(missing).toEqual([]);
  });

  it('has a details entry for every exercise, and no orphans', () => {
    const ids = new Set(raw.map((entry) => entry['id'] as string));
    const detailIds = new Set(Object.keys(details));

    expect([...ids].filter((id) => !detailIds.has(id))).toEqual([]);
    expect([...detailIds].filter((id) => !ids.has(id))).toEqual([]);
  });

  it('keeps the heavy fields out of the searchable core', () => {
    // The split is what keeps the core at ~19 kB gzipped (§2.2).
    for (const entry of raw) {
      expect(entry['instructions']).toBeUndefined();
      expect(entry['images']).toBeUndefined();
    }
    expect(Object.values(details).some((entry) => entry.instructions.length > 0)).toBe(true);
  });

  it('is sorted by id, so a refresh produces a readable diff', () => {
    const ids = raw.map((entry) => entry['id'] as string);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('searching the real catalog', () => {
  const catalog = raw
    .map((entry) => parseCatalogExercise(entry))
    .filter((entry): entry is CatalogExercise => entry !== null)
    .map(fromCatalog);

  const index = buildSearchIndex(catalog);

  it('finds common lifts by partial name', () => {
    for (const query of ['bench press', 'squat', 'deadlift', 'pull up', 'curl']) {
      expect(search(index, query, { limit: 5 }).length).toBeGreaterThan(0);
    }
  });

  it('ranks the plain barbell bench press into the top results for "bench press"', () => {
    const top = search(index, 'bench press', { limit: 5 }).map((item) => item.name);
    expect(top.some((name) => name.includes('Barbell Bench Press'))).toBe(true);
  });

  it('filters the real catalog by muscle and equipment together', () => {
    const results = search(index, '', { muscles: ['chest'], equipment: ['dumbbell'] });
    expect(results.length).toBeGreaterThan(3);
    expect(
      results.every(
        (item) =>
          item.equipment === 'dumbbell' &&
          (item.primaryMuscles.includes('chest') || item.secondaryMuscles.includes('chest')),
      ),
    ).toBe(true);
  });

  it('answers a keystroke fast enough to feel instant', () => {
    const started = performance.now();
    for (const query of ['b', 'be', 'ben', 'benc', 'bench', 'bench p', 'bench pr']) {
      search(index, query, { limit: 50 });
    }
    // Seven keystrokes over the full catalog, well inside one frame budget.
    expect(performance.now() - started).toBeLessThan(150);
  });
});
