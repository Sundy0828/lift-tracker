import type { BodyRegion, BodyView } from '@lift/domain/bodyMap';
import { DRAWN_MUSCLE_SET, VIEW_BOX, inertFor, regionsFor } from '@lift/domain/bodyMap';
import type { MuscleGroup } from '@lift/domain/muscles';
import { baseMuscleOf, muscleLabel } from '@lift/domain/muscles';
import type { VolumeByMuscle } from '@lift/domain/volume';
import {
  formatSetEquivalents,
  heatByRegion,
  heatStop,
  totalSetEquivalents,
  volumeRows,
} from '@lift/domain/volume';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Polygon } from 'react-native-svg';
import { usePalette } from '../theme';

/**
 * Front and back body heat map, and the set counts behind it: the web's
 * `MuscleMap`, drawn with react-native-svg from the same geometry
 * (`@lift/domain/bodyMap`) and the same bands.
 *
 * The drawing is decorative and hidden from screen readers. The list under it
 * is the real content, and the only place to read an exact number.
 */

type Props = {
  volume: VolumeByMuscle;
  /** Band thresholds: session or weekly (see @lift/domain/volume). */
  stops: readonly [number, number, number, number];
  /** What the numbers cover, e.g. "this workout". */
  scopeLabel: string;
  /** What the numbers count: the prescription, or what was logged. */
  basis: 'planned' | 'logged';
};

function Figure({
  view,
  fillFor,
  narrow = false,
}: {
  view: BodyView;
  fillFor: (region: BodyRegion) => string;
  narrow?: boolean;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.figure, narrow && styles.figureNarrow]}>
      <Svg viewBox={VIEW_BOX} style={styles.svg}>
        {inertFor(view).map((points) => (
          <Polygon
            key={points}
            points={points}
            fill={palette.bodyInert}
            stroke={palette.bodyStroke}
            strokeWidth={0.4}
          />
        ))}
        {regionsFor(view).map((region) => (
          <G key={region.id} fill={fillFor(region)} stroke={palette.bodyStroke} strokeWidth={0.4}>
            {region.polygons.map((points) => (
              <Polygon key={points} points={points} />
            ))}
          </G>
        ))}
      </Svg>
      <Text style={[styles.caption, { color: palette.dimmed }]}>{view.toUpperCase()}</Text>
    </View>
  );
}

export function MuscleMap({ volume, stops, scopeLabel, basis }: Props) {
  const palette = usePalette();
  // A drawn extension keeps its own volume; anything else falls into its base
  // group, which is always drawn.
  const byRegion = heatByRegion(volume, DRAWN_MUSCLE_SET);
  const rows = volumeRows(volume, stops);
  const total = totalSetEquivalents(volume);

  // A region sums the muscles it answers for: generic shoulder work shades
  // both delts, since it cannot be attributed front or back.
  const fillFor = (region: BodyRegion): string => {
    let sum = 0;
    for (const source of region.sources) sum += byRegion.get(source) ?? 0;
    return palette.heat[heatStop(sum, stops)];
  };

  return (
    <View style={styles.root}>
      <View
        style={styles.pair}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Figure view="front" fillFor={fillFor} />
        <Figure view="back" fillFor={fillFor} />
      </View>

      <View style={styles.legend} accessibilityElementsHidden>
        <Text style={[styles.small, { color: palette.dimmed }]}>Less</Text>
        {palette.heat.map((color) => (
          <View
            key={color}
            style={[styles.swatch, { backgroundColor: color, borderColor: palette.bodyStroke }]}
          />
        ))}
        <Text style={[styles.small, { color: palette.dimmed }]}>More</Text>
      </View>

      {rows.length === 0 ? (
        <Text style={[styles.small, styles.center, { color: palette.dimmed }]}>
          No exercises yet. Add one to see what {scopeLabel} works.
        </Text>
      ) : (
        <View style={styles.table}>
          <Text style={[styles.small, { color: palette.dimmed }]}>
            Set-equivalents in {scopeLabel}, {formatSetEquivalents(total)} in all. A set counts 1
            for each primary muscle and 0.5 for each secondary.{' '}
            {basis === 'logged'
              ? 'Warmups and skipped sets count for nothing.'
              : 'Counted from the prescription.'}
          </Text>
          {rows.map((row) => (
            <View key={row.muscle} style={styles.tableRow}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: palette.heat[row.stop], borderColor: palette.bodyStroke },
                ]}
              />
              <Text style={[styles.body, styles.grow, { color: palette.text }]}>
                {muscleLabel(row.muscle)}
              </Text>
              <Text style={[styles.body, styles.number, { color: palette.text }]}>
                {formatSetEquivalents(row.setEquivalents)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Front and back diagram of the muscles one exercise works: the web's
 * `MuscleFocus`. It reads on the heat map's own scale, primary at the top stop
 * and secondary in the middle, and the key below names the same muscles.
 */
export function MuscleFocus({
  primary,
  secondary,
}: {
  primary: readonly MuscleGroup[];
  secondary: readonly MuscleGroup[];
}) {
  const palette = usePalette();
  const primarySet = withBaseGroups(primary);
  const secondarySet = withBaseGroups(secondary);
  const primaryColor = palette.heat[4];
  const secondaryColor = palette.heat[2];

  const fillFor = (region: BodyRegion): string =>
    region.sources.some((muscle) => primarySet.has(muscle))
      ? primaryColor
      : region.sources.some((muscle) => secondarySet.has(muscle))
        ? secondaryColor
        : palette.heat[0];

  return (
    <View style={styles.root}>
      <View
        style={styles.pair}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Figure view="front" fillFor={fillFor} narrow />
        <Figure view="back" fillFor={fillFor} narrow />
      </View>
      <FocusKey label="Primary" color={primaryColor} muscles={primary} />
      <FocusKey label="Secondary" color={secondaryColor} muscles={secondary} />
    </View>
  );
}

/** One band of the key: swatch, name, and the muscles it covers. */
function FocusKey({
  label,
  color,
  muscles,
}: {
  label: string;
  color: string;
  muscles: readonly MuscleGroup[];
}) {
  const palette = usePalette();
  return (
    <View style={styles.keyRow}>
      <View style={[styles.swatch, { backgroundColor: color, borderColor: palette.bodyStroke }]} />
      <Text style={[styles.body, styles.keyLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.body, styles.grow, { color: palette.dimmed }]}>
        {muscles.map(muscleLabel).join(', ') || '—'}
      </Text>
    </View>
  );
}

/** The muscles plus the base group each one paints, so undrawn muscles still shade. */
function withBaseGroups(muscles: readonly MuscleGroup[]): ReadonlySet<MuscleGroup> {
  const found = new Set<MuscleGroup>();
  for (const muscle of muscles) {
    found.add(muscle);
    found.add(baseMuscleOf(muscle));
  }
  return found;
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  pair: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  figure: { flex: 1, maxWidth: 152, alignItems: 'center', gap: 2 },
  // Narrower than the heat map: this sits in a detail view.
  figureNarrow: { maxWidth: 120 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyLabel: { fontWeight: '600' },
  // The artwork is 100 x 220.
  svg: { width: '100%', aspectRatio: 100 / 220 },
  caption: { fontSize: 11, letterSpacing: 0.5 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  swatch: { width: 16, height: 12, borderRadius: 2, borderWidth: 1 },
  table: { gap: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  body: { fontSize: 15 },
  number: { fontVariant: ['tabular-nums'] },
  small: { fontSize: 13, lineHeight: 18 },
  center: { textAlign: 'center' },
  grow: { flex: 1 },
});
