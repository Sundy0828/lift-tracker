import { describe, expect, it } from 'vitest';
import type { TrendSample } from './trend';
import { trendChange, trendGeometry } from './trend';

const BOX = { width: 100, height: 50, padding: 5 };

function sample(dateKey: string, value: number): TrendSample {
  return { dateKey, value };
}

describe('trendGeometry', () => {
  it('returns null for an empty series', () => {
    expect(trendGeometry([], BOX)).toBeNull();
  });

  it('centres a single point', () => {
    const geometry = trendGeometry([sample('2025-08-04', 100)], BOX);
    expect(geometry?.points[0]?.x).toBe(50);
  });

  it('puts the largest value at the top of the box', () => {
    const geometry = trendGeometry([sample('2025-08-04', 100), sample('2025-08-11', 120)], BOX);
    // SVG y grows downwards, so the maximum sits at the padding line.
    expect(geometry?.points[1]?.y).toBe(5);
    expect(geometry?.points[0]?.y).toBe(45);
  });

  it('spaces points by elapsed time, not by position', () => {
    // One week, then three. The middle point belongs a quarter of the way along.
    const geometry = trendGeometry(
      [sample('2025-08-04', 100), sample('2025-08-11', 100), sample('2025-09-01', 100)],
      BOX,
    );
    expect(geometry?.points.map((point) => point.x)).toEqual([5, 27.5, 95]);
  });

  it('spreads several samples from one day evenly, having no duration to honour', () => {
    const geometry = trendGeometry(
      [sample('2025-08-04', 100), sample('2025-08-04', 110), sample('2025-08-04', 120)],
      BOX,
    );
    expect(geometry?.points.map((point) => point.x)).toEqual([5, 50, 95]);
  });

  it('draws a flat series down the middle rather than on an edge', () => {
    const geometry = trendGeometry([sample('2025-08-04', 100), sample('2025-08-11', 100)], BOX);
    expect(geometry?.points.every((point) => point.y === 25)).toBe(true);
  });

  it('reports the value range it fitted', () => {
    const geometry = trendGeometry(
      [sample('2025-08-04', 100), sample('2025-08-11', 130), sample('2025-08-18', 90)],
      BOX,
    );
    expect(geometry?.min).toBe(90);
    expect(geometry?.max).toBe(130);
  });

  it('emits a polyline and a closed area over the same points', () => {
    const geometry = trendGeometry([sample('2025-08-04', 100), sample('2025-08-11', 120)], BOX);
    expect(geometry?.line).toBe('5,45 95,5');
    expect(geometry?.area).toBe('M 5,45 L 5,45 L 95,5 L 95,45 Z');
  });

  it('keeps an unparseable date on the line instead of off the left edge', () => {
    const geometry = trendGeometry(
      [sample('2025-08-04', 100), sample('nonsense', 110), sample('2025-08-06', 120)],
      BOX,
    );
    expect(geometry?.points.every((point) => point.x >= 5 && point.x <= 95)).toBe(true);
  });

  it('exposes the ends, for the axis labels', () => {
    const geometry = trendGeometry([sample('2025-08-04', 100), sample('2025-08-11', 120)], BOX);
    expect(geometry?.first.dateKey).toBe('2025-08-04');
    expect(geometry?.last.value).toBe(120);
  });
});

describe('trendChange', () => {
  it('measures the last value against the first', () => {
    expect(trendChange([sample('2025-08-04', 100), sample('2025-08-11', 112.5)])).toBe(12.5);
  });

  it('has nothing to say about a single point', () => {
    expect(trendChange([sample('2025-08-04', 100)])).toBeNull();
    expect(trendChange([])).toBeNull();
  });
});
