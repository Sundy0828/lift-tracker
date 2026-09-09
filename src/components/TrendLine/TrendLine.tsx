import { Text } from '@mantine/core';
import { memo } from 'react';
import { formatShortDate } from '@/domain/history';
import type { TrendSample } from '@/domain/trend';
import { trendGeometry } from '@/domain/trend';
import classes from './TrendLine.module.css';

/**
 * The one chart in the app, hand-rolled in SVG.
 *
 * `@mantine/charts` wraps Recharts, which is an order of magnitude past the
 * dependency budget in §3 for a single line — and a line, some dots and a
 * fill is all this needs. The arithmetic lives in `domain/trend`, tested.
 *
 * **The chart is decorative.** It is hidden from assistive technology and the
 * performance list beneath it is the real content, with the same numbers in
 * reading order — the same split the muscle map uses.
 */

const WIDTH = 320;
const HEIGHT = 110;
const PADDING = 8;

export type TrendLineProps = {
  /** Oldest first. */
  samples: readonly TrendSample[];
  /** Renders a value for the axis ends, already in the display unit. */
  formatValue: (value: number) => string;
  /** Sample indices that set a record, drawn as filled markers. */
  records?: ReadonlySet<number>;
};

export const TrendLine = memo(function TrendLine({
  samples,
  formatValue,
  records,
}: TrendLineProps) {
  const geometry = trendGeometry(samples, { width: WIDTH, height: HEIGHT, padding: PADDING });
  if (geometry === null) return null;

  const { points, line, area, min, max, first, last } = geometry;
  // A flat series has no range to label, and printing the same number twice on
  // both ends of the axis reads as a bug rather than as "nothing changed".
  const flat = max - min < 0.005;

  return (
    <div className={classes.wrap}>
      <svg
        className={classes.svg}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {flat ? null : <path className={classes.area} d={area} />}
        <line
          className={classes.baseline}
          x1={PADDING}
          x2={WIDTH - PADDING}
          y1={HEIGHT - PADDING}
          y2={HEIGHT - PADDING}
        />
        <polyline className={classes.line} points={line} />
        {points.map((point) => (
          <circle
            key={`${point.dateKey}-${String(point.index)}`}
            className={records?.has(point.index) === true ? classes.record : classes.dot}
            cx={point.x}
            cy={point.y}
            r={records?.has(point.index) === true ? 4 : 3}
          />
        ))}
      </svg>

      <div className={classes.axis}>
        <span>
          {formatShortDate(first.dateKey)} · {formatValue(first.value)}
        </span>
        <span>
          {formatShortDate(last.dateKey)} · {formatValue(last.value)}
        </span>
      </div>
      {flat ? null : (
        <Text size="xs" c="dimmed" ta="center">
          Range {formatValue(min)} – {formatValue(max)}
        </Text>
      )}
    </div>
  );
});
