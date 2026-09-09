import { dateFromKey } from './sessions';

/**
 * Geometry for the one trend line in the app, computed as pure numbers so the
 * chart itself is a handful of SVG elements and no charting library.
 *
 * `@mantine/charts` wraps Recharts, which is far past the dependency budget in
 * §3 for a single sparkline, so the line is hand-rolled — and the part worth
 * testing is this arithmetic, not the markup.
 *
 * The coordinate space is SVG's: y grows downwards, so the largest value sits
 * at the smallest y.
 */

const MS_PER_DAY = 86_400_000;

/** One value on a date. The caller decides what the value means. */
export type TrendSample = {
  dateKey: string;
  value: number;
};

export type TrendPoint = {
  /** Index into the samples array the point came from. */
  index: number;
  dateKey: string;
  value: number;
  x: number;
  y: number;
};

export type TrendGeometry = {
  width: number;
  height: number;
  points: TrendPoint[];
  /** `x,y x,y …` for an SVG `<polyline>`. */
  line: string;
  /** A closed `<path>` under the line, for the fill. */
  area: string;
  /** The value range the box was fitted to. */
  min: number;
  max: number;
  first: TrendPoint;
  last: TrendPoint;
};

export type TrendOptions = {
  width: number;
  height: number;
  /** Room for the dot radius and the stroke, so neither is clipped. */
  padding: number;
};

function round(value: number): number {
  // Two decimals is well under a device pixel at these sizes and keeps the
  // generated path short enough to read in a snapshot.
  return Math.round(value * 100) / 100;
}

/**
 * Places samples in a box.
 *
 * **x is time, not position.** Sessions are unevenly spaced — three days
 * apart, then a fortnight off — and spacing the points evenly would draw a
 * steady climb over a break that was actually a gap. The one exception is a
 * series that spans no time at all (a single point, or several logged on one
 * day), which is spread evenly because there is no duration to be faithful to.
 *
 * A flat series sits on the vertical middle rather than at the top or bottom:
 * pinning it to an edge reads as a maximum or a collapse when it is neither.
 *
 * Returns null for an empty series — a chart of nothing is the caller's empty
 * state, not a degenerate path.
 */
export function trendGeometry(
  samples: readonly TrendSample[],
  { width, height, padding }: TrendOptions,
): TrendGeometry | null {
  if (samples.length === 0) return null;

  const left = padding;
  const right = width - padding;
  const top = padding;
  const bottom = height - padding;

  const times = samples.map((sample) => dateFromKey(sample.dateKey)?.getTime() ?? null);
  const days = times.map((time, index) => {
    const start = times[0];
    // A key that will not parse falls back to its position, which keeps the
    // point on the line instead of dropping it off the left edge.
    if (time === null || start === null || start === undefined) return index;
    return (time - start) / MS_PER_DAY;
  });

  const span = Math.max(...days) - Math.min(...days);
  const values = samples.map((sample) => sample.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const points: TrendPoint[] = samples.map((sample, index) => {
    const offset = days[index] ?? index;
    const x =
      span > 0
        ? left + ((offset - (days[0] ?? 0)) / span) * (right - left)
        : samples.length === 1
          ? (left + right) / 2
          : left + (index / (samples.length - 1)) * (right - left);

    const y =
      range > 0 ? bottom - ((sample.value - min) / range) * (bottom - top) : (top + bottom) / 2;

    return { index, dateKey: sample.dateKey, value: sample.value, x: round(x), y: round(y) };
  });

  const line = points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  // Both exist: the array is non-empty and the map above is total.
  if (first === undefined || last === undefined) return null;

  const area = `M ${String(first.x)},${String(bottom)} L ${line.split(' ').join(' L ')} L ${String(
    last.x,
  )},${String(bottom)} Z`;

  return { width, height, points, line, area, min, max, first, last };
}

/**
 * The overall direction of a series: the last value against the first.
 *
 * Deliberately end-to-end rather than a fitted slope. The question a lifter
 * asks a trend line is "am I stronger than when I started", and a regression
 * line answers a subtly different one — it can read as improving while the
 * most recent sessions fall.
 */
export function trendChange(samples: readonly TrendSample[]): number | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined || samples.length < 2) return null;
  return last.value - first.value;
}
