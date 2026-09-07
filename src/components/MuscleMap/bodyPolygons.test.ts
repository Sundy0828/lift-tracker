import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS, baseMuscleOf, isMuscleGroup } from '@/domain/muscles';
import {
  BACK_INERT,
  BACK_REGIONS,
  DRAWN_MUSCLE_SET,
  FRONT_INERT,
  FRONT_REGIONS,
  VIEW_BOX,
  inertFor,
  regionsFor,
} from './bodyPolygons';

const ALL_REGIONS = [...FRONT_REGIONS, ...BACK_REGIONS];

/** Every number in a polygon's `points`, as [x, y] pairs. */
function points(polygon: string): { x: number; y: number }[] {
  const numbers = polygon.trim().split(/\s+/u).map(Number);
  const pairs: { x: number; y: number }[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    pairs.push({ x: numbers[index] ?? NaN, y: numbers[index + 1] ?? NaN });
  }
  return pairs;
}

describe('body regions', () => {
  it('draws both views', () => {
    expect(FRONT_REGIONS.length).toBeGreaterThan(8);
    expect(BACK_REGIONS.length).toBeGreaterThan(8);
    expect(regionsFor('front')).toBe(FRONT_REGIONS);
    expect(regionsFor('back')).toBe(BACK_REGIONS);
    expect(inertFor('front')).toBe(FRONT_INERT);
    expect(inertFor('back')).toBe(BACK_INERT);
  });

  it('gives every region at least one polygon', () => {
    for (const region of ALL_REGIONS) {
      expect(region.polygons.length, region.id).toBeGreaterThan(0);
    }
  });

  it('uses unique region ids within a view', () => {
    for (const regions of [FRONT_REGIONS, BACK_REGIONS]) {
      const ids = regions.map((region) => region.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('names only real muscles as sources', () => {
    for (const region of ALL_REGIONS) {
      expect(region.sources.length, region.id).toBeGreaterThan(0);
      for (const source of region.sources) {
        expect(isMuscleGroup(source), `${region.id}: ${source}`).toBe(true);
      }
    }
  });

  it('shades every muscle in both tiers somewhere', () => {
    // The invariant the whole two-tier vocabulary rests on: nothing can be
    // tracked but undrawable.
    const missing = MUSCLE_GROUPS.filter((muscle) => !DRAWN_MUSCLE_SET.has(muscle));
    expect(missing).toEqual([]);
  });

  it('keeps every source inside the region its base group belongs to', () => {
    // A region may answer for several muscles, but they must be related: an
    // extension and its parent, or siblings under one parent.
    for (const region of ALL_REGIONS) {
      const bases = new Set(region.sources.map(baseMuscleOf));
      expect(bases.size, `${region.id} spans ${[...bases].join(', ')}`).toBeLessThanOrEqual(3);
    }
  });

  it('splits the delts front and back, with generic shoulder work on both', () => {
    const front = FRONT_REGIONS.find((region) => region.id === 'front-deltoids');
    const back = BACK_REGIONS.find((region) => region.id === 'back-deltoids');

    expect(front?.sources).toContain('front delts');
    expect(front?.sources).toContain('side delts');
    expect(back?.sources).toContain('rear delts');
    // Unattributed shoulder work shades both, since it belongs to neither.
    expect(front?.sources).toContain('shoulders');
    expect(back?.sources).toContain('shoulders');
  });

  it('keeps the adductors on the inner thigh, not the outer hip', () => {
    // Upstream labels the inner thigh "abductors"; renaming it was the point.
    const adductors = FRONT_REGIONS.find((region) => region.id === 'adductors');
    const abductors = FRONT_REGIONS.find((region) => region.id === 'abductors');
    expect(adductors?.sources).toEqual(['adductors']);
    expect(abductors?.sources).toEqual(['abductors']);

    const midline = 50;
    const nearest = (polygons: readonly string[]): number =>
      Math.min(...polygons.flatMap((p) => points(p).map((q) => Math.abs(q.x - midline))));

    // The adductors hug the midline; the abductors sit out at the hip.
    expect(nearest(adductors?.polygons ?? [])).toBeLessThan(nearest(abductors?.polygons ?? []));
  });

  it('sizes the viewBox to the artwork, which upstream clips', () => {
    expect(VIEW_BOX).toBe('0 0 100 220');
  });

  it('keeps every coordinate inside the viewBox', () => {
    const [, , width, height] = VIEW_BOX.split(' ').map(Number);
    for (const region of ALL_REGIONS) {
      for (const polygon of region.polygons) {
        for (const { x, y } of points(polygon)) {
          expect(Number.isFinite(x) && Number.isFinite(y), `${region.id}: ${polygon}`).toBe(true);
          expect(x, region.id).toBeGreaterThanOrEqual(0);
          expect(x, region.id).toBeLessThanOrEqual(width ?? 100);
          expect(y, region.id).toBeGreaterThanOrEqual(0);
          expect(y, region.id).toBeLessThanOrEqual(height ?? 200);
        }
      }
    }
  });

  it('gives every polygon at least three points', () => {
    for (const region of ALL_REGIONS) {
      for (const polygon of region.polygons) {
        expect(points(polygon).length, `${region.id}: ${polygon}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('draws the head and knees as unshaded silhouette', () => {
    expect(FRONT_INERT.length).toBeGreaterThan(0);
    expect(BACK_INERT.length).toBeGreaterThan(0);
  });
});
