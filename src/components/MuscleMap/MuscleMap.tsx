import { Table, Text } from '@mantine/core';
import { memo } from 'react';
import { muscleLabel } from '@/domain/muscles';
import type { MuscleGroup } from '@/domain/muscles';
import type { HeatStop, VolumeByMuscle } from '@/domain/volume';
import {
  WEEKLY_STOPS,
  formatSetEquivalents,
  heatByRegion,
  heatStop,
  totalSetEquivalents,
  volumeRows,
} from '@/domain/volume';
import type { BodyView } from './bodyPaths';
import { DRAWN_MUSCLE_SET, VIEW_BOX, outlineFor, pathsFor } from './bodyPaths';
import classes from './MuscleMap.module.css';

/**
 * Front/back body heat map plus the set-count readout behind it.
 *
 * The diagram is **decorative** and hidden from assistive technology: the
 * table is the real content, which is also the only way to read an exact
 * number. The diagram shades base muscle groups; the table lists the finer
 * muscles, so a rear-delt row appears by name while the drawing shades the
 * shoulder.
 */

const STOP_CLASSES: Record<HeatStop, string> = {
  0: classes.stop0,
  1: classes.stop1,
  2: classes.stop2,
  3: classes.stop3,
  4: classes.stop4,
};

type BodyFigureProps = {
  view: BodyView;
  stopFor: (muscle: MuscleGroup) => HeatStop;
};

const BodyFigure = memo(function BodyFigure({ view, stopFor }: BodyFigureProps) {
  const paths = pathsFor(view);

  return (
    <figure className={classes.figure}>
      <svg className={classes.svg} viewBox={VIEW_BOX} aria-hidden="true" focusable="false">
        <path className={classes.inert} d={outlineFor(view)} />
        {Object.entries(paths).map(([muscle, d]) => (
          <path
            key={muscle}
            data-muscle={muscle}
            className={`${classes.muscle} ${STOP_CLASSES[stopFor(muscle as MuscleGroup)]}`}
            d={d}
          />
        ))}
      </svg>
      <figcaption className={classes.caption}>{view}</figcaption>
    </figure>
  );
});

export type MuscleMapProps = {
  /** Fine-grained volume; rolled up internally for the diagram. */
  volume: VolumeByMuscle;
  /** Band thresholds — session or weekly (see domain/volume). */
  stops?: readonly [number, number, number, number];
  /** Describes what the numbers cover, e.g. "this session" or "per week". */
  scopeLabel: string;
  /** Hide the readout table when several maps share one table. */
  withTable?: boolean;
  /** Stable hook for tests, since the surrounding labels change as it toggles. */
  testId?: string;
};

export function MuscleMap({
  volume,
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

  const stopFor = (muscle: MuscleGroup): HeatStop => heatStop(byRegion.get(muscle) ?? 0, stops);

  return (
    <div className={classes.wrap} data-testid={testId}>
      <div className={classes.figures}>
        <BodyFigure view="front" stopFor={stopFor} />
        <BodyFigure view="back" stopFor={stopFor} />
      </div>

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
              Set-equivalents {scopeLabel} — {formatSetEquivalents(total)} total. A set counts 1 for
              each primary muscle and 0.5 for each secondary.
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
