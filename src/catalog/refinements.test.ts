import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFINEMENTS, refineMuscles } from '../../scripts/catalog-refinements';
import type { CatalogExercise } from '@/domain/exercises';
import { baseMuscleOf, isExtendedMuscleGroup, type MuscleGroup } from '@/domain/muscles';

/**
 * The curated refinements are a mapping layer, so they are treated as code:
 * the rules are unit-tested, and the committed catalog is checked against them
 * so a rule that stops matching upstream fails the build instead of quietly
 * going stale.
 */

const catalog = JSON.parse(
  readFileSync(join(import.meta.dirname, 'generated', 'exercises.json'), 'utf8'),
) as readonly CatalogExercise[];

const byName = (pattern: RegExp): readonly CatalogExercise[] =>
  catalog.filter((entry) => pattern.test(entry.name));

describe('refineMuscles', () => {
  it('leaves a non-matching name untouched', () => {
    expect(refineMuscles('Barbell Squat', ['quadriceps'])).toEqual(['quadriceps']);
    expect(refineMuscles('Barbell Bench Press', ['chest'])).toEqual(['chest']);
  });

  it('replaces only the muscle a rule names', () => {
    expect(refineMuscles('Cable Rear Delt Fly', ['shoulders', 'triceps'])).toEqual([
      'rear delts',
      'triceps',
    ]);
  });

  it('does nothing when the pattern matches but the muscle is absent', () => {
    // A rear-delt row's *secondary* muscles contain no `shoulders` to refine.
    expect(refineMuscles('Barbell Rear Delt Row', ['biceps', 'lats'])).toEqual(['biceps', 'lats']);
  });

  it('applies rear delts before side delts, so a rear lateral is not mislabelled', () => {
    expect(refineMuscles('Dumbbell Lying One-Arm Rear Lateral Raise', ['shoulders'])).toEqual([
      'rear delts',
    ]);
    expect(refineMuscles('Side Lateral Raise', ['shoulders'])).toEqual(['side delts']);
  });

  it('handles the hyphenated spelling upstream also uses', () => {
    expect(refineMuscles('Cable Rope Rear-Delt Rows', ['shoulders'])).toEqual(['rear delts']);
  });

  it('deduplicates when a refinement collides with an existing entry', () => {
    expect(refineMuscles('Cable Rear Delt Fly', ['shoulders', 'rear delts'])).toEqual([
      'rear delts',
    ]);
  });

  it('only ever replaces within one base group, so volume cannot move region', () => {
    for (const rule of REFINEMENTS) {
      expect(baseMuscleOf(rule.to), `${rule.from} -> ${rule.to}`).toBe(rule.from);
    }
  });

  it('refines to extensions only, never to another base name', () => {
    for (const rule of REFINEMENTS) {
      expect(isExtendedMuscleGroup(rule.to), rule.to).toBe(true);
    }
  });
});

describe('the committed catalog reflects the rules', () => {
  it('meets every rule expected minimum', () => {
    for (const rule of REFINEMENTS) {
      const hits = catalog.filter(
        (entry) =>
          entry.primaryMuscles.includes(rule.to) || entry.secondaryMuscles.includes(rule.to),
      );
      expect(hits.length, `${rule.from} -> ${rule.to}`).toBeGreaterThanOrEqual(rule.expectAtLeast);
    }
  });

  it('tags the tibialis raise case that prompted this', () => {
    const tib = byName(/anterior tibialis/iu);
    expect(tib.length).toBeGreaterThan(0);
    for (const entry of tib) {
      expect(entry.primaryMuscles).toContain('tibialis');
      // The whole point: it must NOT count as calf volume.
      expect(entry.primaryMuscles).not.toContain('calves');
    }
  });

  it('leaves the posterior tibialis with the calves, where it belongs', () => {
    for (const entry of byName(/posterior tibialis/iu)) {
      expect(entry.primaryMuscles).toContain('calves');
      expect(entry.primaryMuscles).not.toContain('tibialis');
    }
  });

  it('separates rear delts from the generic shoulders bucket', () => {
    for (const entry of byName(/rear[- ]delt|reverse fly|face pull/iu)) {
      expect(entry.primaryMuscles.includes('rear delts'), entry.name).toBe(true);
    }
  });

  it('no longer lumps every delt movement together', () => {
    const primary = (muscle: MuscleGroup): number =>
      catalog.filter((entry) => entry.primaryMuscles.includes(muscle)).length;

    expect(primary('rear delts')).toBeGreaterThan(0);
    expect(primary('side delts')).toBeGreaterThan(0);
    expect(primary('front delts')).toBeGreaterThan(0);
    // The generic bucket still holds the presses and everything unclassified.
    expect(primary('shoulders')).toBeGreaterThan(50);
  });

  it('keeps every refined muscle paintable on the body diagram', () => {
    // Extensions in the catalog must still roll up to a base group, or the
    // muscle map would have data it cannot draw.
    for (const entry of catalog) {
      for (const muscle of [...entry.primaryMuscles, ...entry.secondaryMuscles]) {
        expect(baseMuscleOf(muscle), `${entry.name}: ${muscle}`).toBeTruthy();
      }
    }
  });
});
