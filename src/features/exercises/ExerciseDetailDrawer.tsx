import { Button, Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';
import type { Exercise } from '@/domain/exercises';
import { ExerciseDetail } from './ExerciseDetail';
import { Panel, PanelHeader } from './Panel';
import classes from './ExerciseDetailDrawer.module.css';

type Props = {
  exercise: Exercise | null;
  onClose: () => void;
  /** Adds an Edit button for a custom exercise. */
  onEdit?: ((exercise: Exercise) => void) | undefined;
  /** Adds a Delete button for a custom exercise. */
  onDelete?: ((exercise: Exercise) => void) | undefined;
  /** Extra buttons in the pinned footer, such as a confirm action. */
  actions?: ReactNode | undefined;
  /** Set when this opens over another panel. */
  zIndex?: number | undefined;
};

/** One exercise: its frames, the muscles it works and its instructions. */
export function ExerciseDetailDrawer({
  exercise,
  onClose,
  onEdit,
  onDelete,
  actions,
  zIndex,
}: Props) {
  const editable = exercise?.isCustom === true;
  const withEdit = editable && onEdit !== undefined;
  const withDelete = editable && onDelete !== undefined;
  const withFooter = actions !== undefined || withEdit || withDelete;

  return (
    <Panel
      opened={exercise !== null}
      onClose={onClose}
      label={exercise?.name ?? 'Exercise'}
      zIndex={zIndex}
    >
      {exercise === null ? null : (
        <Stack gap="sm">
          <PanelHeader title={exercise.name} onClose={onClose} />

          <ExerciseDetail exercise={exercise} />

          {withFooter ? (
            <Group justify="flex-end" className={classes.actions}>
              {withEdit ? (
                <Button
                  variant="default"
                  onClick={() => {
                    onEdit(exercise);
                  }}
                >
                  Edit
                </Button>
              ) : null}
              {withDelete ? (
                <Button
                  variant="light"
                  color="red"
                  onClick={() => {
                    onDelete(exercise);
                  }}
                >
                  Delete
                </Button>
              ) : null}
              {actions}
            </Group>
          ) : null}
        </Stack>
      )}
    </Panel>
  );
}
