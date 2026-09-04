import { describe, expect, it } from 'vitest';
import { BASE_MUSCLE_GROUPS, MUSCLE_GROUPS, baseMuscleOf } from '@/domain/muscles';
import {
  BACK_PATHS,
  DRAWN_BASE_MUSCLES,
  DRAWN_MUSCLES,
  FRONT_PATHS,
  outlineFor,
  pathsFor,
} from './bodyPaths';

/**
 * The diagram is decorative, but it must not be able to *silently* drop a
 * muscle: a base group with no path would make volume invisible on the map
 * while still showing in the table.
 */

describe('body paths', () => {
  it('draws every base muscle group on at least one view', () => {
    const missing = BASE_MUSCLE_GROUPS.filter((muscle) => !DRAWN_BASE_MUSCLES.includes(muscle));
    expect(missing).toEqual([]);
  });

  it('can place every muscle in both tiers on the diagram', () => {
    // Extensions are painted through their parent, so this is the real
    // guarantee that adding a finer muscle never loses it on the map.
    for (const muscle of MUSCLE_GROUPS) {
      expect(DRAWN_MUSCLES).toContain(baseMuscleOf(muscle));
    }
  });

  it('draws only known muscles, from either tier', () => {
    for (const muscle of DRAWN_MUSCLES) {
      expect(MUSCLE_GROUPS).toContain(muscle);
    }
  });

  it('may draw a finer region than the base vocabulary, e.g. obliques', () => {
    // Drawn extensions get their own shading via heatByRegion rather than
    // being folded into their parent — the hook for splitting delts later.
    expect(FRONT_PATHS.obliques).toBeDefined();
    expect(DRAWN_MUSCLES).toContain('obliques');
  });

  it('puts the anatomically front muscles on the front view only', () => {
    for (const muscle of ['chest', 'abdominals', 'quadriceps', 'biceps'] as const) {
      expect(FRONT_PATHS[muscle]).toBeDefined();
      expect(BACK_PATHS[muscle]).toBeUndefined();
    }
  });

  it('puts the anatomically back muscles on the back view only', () => {
    for (const muscle of ['lats', 'glutes', 'hamstrings', 'triceps', 'lower back'] as const) {
      expect(BACK_PATHS[muscle]).toBeDefined();
      expect(FRONT_PATHS[muscle]).toBeUndefined();
    }
  });

  it('gives every path a plausible, closed SVG shape', () => {
    for (const view of ['front', 'back'] as const) {
      for (const [muscle, d] of Object.entries(pathsFor(view))) {
        expect(d.startsWith('M'), `${view}/${muscle} starts with a move`).toBe(true);
        expect(d.trimEnd().endsWith('Z'), `${view}/${muscle} is closed`).toBe(true);
        expect(d.length, `${view}/${muscle} is not a stub`).toBeGreaterThan(10);
      }
    }
  });

  it('has a non-empty outline for both views', () => {
    expect(outlineFor('front').startsWith('M')).toBe(true);
    expect(outlineFor('back').startsWith('M')).toBe(true);
  });

  it('keeps every coordinate inside the viewBox', () => {
    // A stray coordinate would clip or shift the figure.
    for (const view of ['front', 'back'] as const) {
      const numbers = [`${outlineFor(view)} ${Object.values(pathsFor(view)).join(' ')}`]
        .join(' ')
        .match(/-?\d+(\.\d+)?/gu);
      expect(numbers).not.toBeNull();
      for (const raw of numbers ?? []) {
        expect(Math.abs(Number(raw))).toBeLessThanOrEqual(300);
      }
    }
  });
});
