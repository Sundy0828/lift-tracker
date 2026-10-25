import { formatShortDate } from '@lift/domain/history';
import type { TrendSample } from '@lift/domain/trend';
import { trendGeometry } from '@lift/domain/trend';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { usePalette } from '../theme';

/**
 * The one chart in the app: the web's `TrendLine`, from the same geometry
 * (`@lift/domain/trend`) and the same size, drawn with react-native-svg.
 *
 * **Decorative.** It is hidden from screen readers; the performance list
 * under it holds the same numbers in reading order.
 */

const WIDTH = 320;
const HEIGHT = 110;
const PADDING = 8;

type Props = {
  /** Oldest first. */
  samples: readonly TrendSample[];
  /** Renders a value for the axis ends, already in the display unit. */
  formatValue: (value: number) => string;
  /** Sample indices that set a record, drawn as filled markers. */
  records?: ReadonlySet<number>;
};

export const TrendLine = memo(function TrendLine({ samples, formatValue, records }: Props) {
  const palette = usePalette();
  const geometry = trendGeometry(samples, { width: WIDTH, height: HEIGHT, padding: PADDING });
  if (geometry === null) return null;

  const { points, line, area, min, max, first, last } = geometry;
  // A flat series has no range to label; the same number at both ends of the
  // axis reads as a bug rather than as "nothing changed".
  const flat = max - min < 0.005;

  return (
    <View style={styles.wrap}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          preserveAspectRatio="none"
          style={styles.svg}
        >
          {flat ? null : <Path d={area} fill={palette.trendArea} opacity={0.45} />}
          <Line
            x1={PADDING}
            x2={WIDTH - PADDING}
            y1={HEIGHT - PADDING}
            y2={HEIGHT - PADDING}
            stroke={palette.border}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <Polyline
            points={line}
            fill="none"
            stroke={palette.trendLine}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point) => {
            const record = records?.has(point.index) === true;
            return (
              <Circle
                key={`${point.dateKey}-${String(point.index)}`}
                cx={point.x}
                cy={point.y}
                r={record ? 4 : 3}
                fill={record ? palette.record : palette.body}
                stroke={record ? palette.recordStroke : palette.trendLine}
                strokeWidth={1.5}
              />
            );
          })}
        </Svg>
      </View>

      <View style={styles.axis}>
        <Text style={[styles.small, { color: palette.dimmed }]}>
          {formatShortDate(first.dateKey)} · {formatValue(first.value)}
        </Text>
        <Text style={[styles.small, { color: palette.dimmed }]}>
          {formatShortDate(last.dateKey)} · {formatValue(last.value)}
        </Text>
      </View>
      {flat ? null : (
        <Text style={[styles.small, styles.center, { color: palette.dimmed }]}>
          Range {formatValue(min)} – {formatValue(max)}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  svg: { width: '100%', aspectRatio: WIDTH / HEIGHT },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontSize: 12, fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
});
