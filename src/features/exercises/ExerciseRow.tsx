import { Badge } from '@mantine/core';
import { memo } from 'react';
import type { Exercise } from '@/domain/exercises';
import { equipmentLabel } from '@/domain/exercises';
import { muscleLabel } from '@/domain/muscles';
import { ExerciseThumb } from './ExerciseThumb';
import classes from './ExerciseRow.module.css';

type Props = {
  exercise: Exercise;
  onSelect: (exercise: Exercise) => void;
  /** Hint that tapping opens a preview rather than acting immediately. */
  withChevron?: boolean;
};

/**
 * One search result: name and muscles on the left, the movement's first frame
 * on the right. The picture is what makes ten near-identical lateral raises
 * distinguishable at a glance.
 *
 * Memoised: the virtualiser re-renders its window on every scroll frame, and
 * rows whose exercise has not changed must not re-render with it.
 */
export const ExerciseRow = memo(function ExerciseRow({
  exercise,
  onSelect,
  withChevron = false,
}: Props) {
  const primary = exercise.primaryMuscles.map(muscleLabel).join(', ');

  return (
    <button
      type="button"
      className={classes.row}
      onClick={() => {
        onSelect(exercise);
      }}
    >
      <span className={classes.text}>
        <span className={classes.name}>{exercise.name}</span>
        <span className={classes.meta}>
          {exercise.isCustom ? (
            <Badge size="xs" variant="light" color="amber">
              Custom
            </Badge>
          ) : null}
          {primary === '' ? 'No muscles set' : primary}
          {' · '}
          {equipmentLabel(exercise.equipment)}
        </span>
      </span>

      <ExerciseThumb exercise={exercise} />

      {withChevron ? (
        <span className={classes.chevron} aria-hidden="true">
          ›
        </span>
      ) : null}
    </button>
  );
});
