import { Table, Text } from '@mantine/core';
import { muscleLabel } from '@/domain/muscles';
import type { HeatStop, VolumeByMuscle } from '@/domain/volume';
import {
  WEEKLY_STOPS,
  formatSetEquivalents,
  heatByRegion,
  heatStop,
  totalSetEquivalents,
  volumeRows,
} from '@/domain/volume';
import { BodyPair } from './BodyFigure';
import type { BodyRegion } from './bodyPolygons';
import { DRAWN_MUSCLE_SET } from './bodyPolygons';
import classes from './MuscleMap.module.css';

/**
 * Front/back body heat map plus the set-count readout behind it.
 *
 * The diagram is **decorative** and hidden from assistive technology: the
 * table is the real content, and the only place to read an exact number.
 *
 * Each shaded region declares the muscles it answers for, so the drawing can
 * be finer than the base vocabulary where the artwork allows (front and rear
 * delts shade separately) and coarser where it does not (lats and mid back
 * share the upper back). The table always lists muscles by their own name.
 */

const STOP_CLASSES: Record<HeatStop, string> = {
  0: classes.stop0,
  1: classes.stop1,
  2: classes.stop2,
  3: classes.stop3,
  4: classes.stop4,
};

/**
 * Where the numbers came from.
 *
 * `logged` is what you did: warmups and skipped sets contribute nothing, so
 * skipping a set genuinely shades that muscle lighter. `planned` is the
 * prescription, which by definition does not move when a session goes
 * differently. The caption says which, because the two look identical.
 */
export type VolumeBasis = 'logged' | 'planned';

export type MuscleMapProps = {
  /** Fine-grained volume; rolled up internally for the diagram. */
  volume: VolumeByMuscle;
  /** What the numbers count. Changes only the caption. */
  basis?: VolumeBasis;
  /** Band thresholds — session or weekly (see domain/volume). */
  stops?: readonly [number, number, number, number];
  /** A noun phrase for what the numbers cover, e.g. "this workout". */
  scopeLabel: string;
  /** Hide the readout table when several maps share one table. */
  withTable?: boolean;
  /** Stable hook for tests, since the surrounding labels change as it toggles. */
  testId?: string;
};

export function MuscleMap({
  volume,
  basis = 'logged',
  stops = WEEKLY_STOPS,
  scopeLabel,
  withTable = true,
  testId,
}: MuscleMapProps) {
  // Attributed to the regions this diagram actually draws: a drawn extension
  // keeps its own volume, anything else falls into its base group. So the
  // shading stays correct if a region is later split out.
  const byRegion = heatByRegion(volume, DRAWN_MUSCLE_SET);
  const rows = volumeRows(volume, stops);
  const total = totalSetEquivalents(volume);

  // A region sums the muscles it answers for. Generic `shoulders` work feeds
  // both delt regions, because it cannot be attributed front or back.
  const stopFor = (region: BodyRegion): HeatStop => {
    let total = 0;
    for (const source of region.sources) total += byRegion.get(source) ?? 0;
    return heatStop(total, stops);
  };

  const classForRegion = (region: BodyRegion): string =>
    `${classes.muscle} ${STOP_CLASSES[stopFor(region)]}`;

  return (
    <div className={classes.wrap} data-testid={testId}>
      <BodyPair classFor={classForRegion} />

      <div className={classes.legend}>
        <span>Less</span>
        <span className={classes.swatches}>
          {([0, 1, 2, 3, 4] as const).map((stop) => (
            <span key={stop} className={`${classes.swatch} ${STOP_CLASSES[stop]}`} />
          ))}
        </span>
        <span>More</span>
      </div>

      {withTable ? (
        rows.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center">
            No exercises yet — add one to see what {scopeLabel} hits.
          </Text>
        ) : (
          <Table
            withTableBorder
            withRowBorders={false}
            verticalSpacing={4}
            horizontalSpacing="xs"
            captionSide="top"
          >
            <Table.Caption>
              Set-equivalents in {scopeLabel} — {formatSetEquivalents(total)} total. A set counts 1
              for each primary muscle and 0.5 for each secondary.{' '}
              {basis === 'logged'
                ? 'Warmups and skipped sets count for nothing, so skipping shades a muscle lighter.'
                : 'Counted from the prescription, so it does not move when a set is skipped.'}
            </Table.Caption>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Muscle</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Sets</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.muscle} data-muscle-row={row.muscle}>
                  <Table.Td>{muscleLabel(row.muscle)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatSetEquivalents(row.setEquivalents)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )
      ) : null}
    </div>
  );
}
