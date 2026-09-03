import { Badge } from '@mantine/core';
import { memo } from 'react';
import type { Exercise } from '@/domain/exercises';
import { equipmentLabel } from '@/domain/exercises';
import { muscleLabel } from '@/domain/muscles';
import classes from './ExerciseRow.module.css';

type Props = {
  exercise: Exercise;
  onSelect: (exercise: Exercise) => void;
};

/**
 * Memoised: the virtualiser re-renders the window on every scroll frame, and
 * rows whose exercise has not changed must not re-render with it.
 */
export const ExerciseRow = memo(function ExerciseRow({ exercise, onSelect }: Props) {
  const primary = exercise.primaryMuscles.map(muscleLabel).join(', ');

  return (
    <button
      type="button"
      className={classes.row}
      onClick={() => {
        onSelect(exercise);
      }}
    >
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
    </button>
  );
});
