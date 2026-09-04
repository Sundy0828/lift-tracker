import { Button, Drawer, Group, Stack } from '@mantine/core';
import type { Exercise } from '@/domain/exercises';
import { ExerciseDetail } from './ExerciseDetail';

type Props = {
  exercise: Exercise | null;
  onClose: () => void;
  onEdit: (exercise: Exercise) => void;
  onDelete: (exercise: Exercise) => void;
};

export function ExerciseDetailDrawer({ exercise, onClose, onEdit, onDelete }: Props) {
  return (
    <Drawer
      opened={exercise !== null}
      onClose={onClose}
      position="bottom"
      size="85%"
      title={exercise?.name ?? ''}
    >
      {exercise === null ? null : (
        <Stack>
          <ExerciseDetail exercise={exercise} />

          {exercise.isCustom ? (
            <Group>
              <Button
                variant="default"
                onClick={() => {
                  onEdit(exercise);
                }}
              >
                Edit
              </Button>
              <Button
                variant="light"
                color="red"
                onClick={() => {
                  onDelete(exercise);
                }}
              >
                Delete
              </Button>
            </Group>
          ) : null}
        </Stack>
      )}
    </Drawer>
  );
}
