import { Text } from '@mantine/core';
import type { MuscleGroup } from '@/domain/muscles';
import { baseMuscleOf, muscleLabel } from '@/domain/muscles';
import { BodyPair } from './BodyFigure';
import type { BodyRegion } from './bodyPolygons';
import map from './MuscleMap.module.css';
import classes from './MuscleFocus.module.css';

/** Top of the heat scale. */
const PRIMARY_STOP = map.stop4;
/** Middle of the heat scale. */
const SECONDARY_STOP = map.stop2;
/** Untrained, as on the heat map. */
const IDLE_STOP = map.stop0;

export type MuscleFocusProps = {
  /** Muscles the exercise trains directly. */
  primary: readonly MuscleGroup[];
  /** Muscles the exercise trains as assistance. */
  secondary: readonly MuscleGroup[];
  /** Stable hook for tests. */
  testId?: string;
};

/**
 * Front and back diagram of the muscles one exercise works.
 *
 * It reads on the heat map's own scale: primary takes the top stop and
 * secondary a middle one. The key below names the same muscles in text.
 */
export function MuscleFocus({ primary, secondary, testId }: MuscleFocusProps) {
  const primarySet = withBaseGroups(primary);
  const secondarySet = withBaseGroups(secondary);

  const classFor = (region: BodyRegion): string => {
    const stop = region.sources.some((muscle) => primarySet.has(muscle))
      ? PRIMARY_STOP
      : region.sources.some((muscle) => secondarySet.has(muscle))
        ? SECONDARY_STOP
        : IDLE_STOP;
    return `${map.muscle} ${stop}`;
  };

  return (
    <div className={classes.wrap} data-testid={testId}>
      <BodyPair classFor={classFor} />

      <Key label="Primary" stop={PRIMARY_STOP} muscles={primary} />
      <Key label="Secondary" stop={SECONDARY_STOP} muscles={secondary} />
    </div>
  );
}

/** One band of the key: swatch, name, and the muscles it covers. */
function Key({
  label,
  stop,
  muscles,
}: {
  label: string;
  stop: string;
  muscles: readonly MuscleGroup[];
}) {
  return (
    <div className={classes.key}>
      <span className={`${map.swatch} ${stop}`} aria-hidden="true" />
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <Text size="sm" c="dimmed">
        {muscles.map(muscleLabel).join(', ') || '—'}
      </Text>
    </div>
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
