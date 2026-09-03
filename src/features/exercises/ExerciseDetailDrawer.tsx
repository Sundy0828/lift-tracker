import { Badge, Button, Drawer, Group, List, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { loadExerciseDetails } from '@/catalog';
import type { Exercise, ExerciseDetails } from '@/domain/exercises';
import { equipmentLabel } from '@/domain/exercises';
import { muscleLabel } from '@/domain/muscles';

type Props = {
  exercise: Exercise | null;
  onClose: () => void;
  onEdit: (exercise: Exercise) => void;
  onDelete: (exercise: Exercise) => void;
};

export function ExerciseDetailDrawer({ exercise, onClose, onEdit, onDelete }: Props) {
  const id = exercise?.id ?? null;
  const isCustom = exercise?.isCustom ?? false;

  // Tagged with the id it belongs to, so opening a second exercise shows a
  // loading state rather than the first one's instructions, and so no state
  // has to be reset from inside the effect.
  const [loaded, setLoaded] = useState<{ id: string; details: ExerciseDetails | null } | null>(
    null,
  );

  useEffect(() => {
    // Custom exercises have no bundled instructions, so nothing to fetch.
    if (id === null || isCustom) return;

    let cancelled = false;

    loadExerciseDetails().then(
      (map) => {
        if (!cancelled) setLoaded({ id, details: map.get(id) ?? null });
      },
      () => {
        if (!cancelled) setLoaded({ id, details: null });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [id, isCustom]);

  const details = loaded?.id === id ? loaded.details : null;
  const loading = !isCustom && id !== null && loaded?.id !== id;

  return (
    <Drawer
      opened={exercise !== null}
      onClose={onClose}
      position="bottom"
      size="80%"
      title={exercise?.name ?? ''}
    >
      {exercise === null ? null : (
        <Stack>
          <Group gap="xs">
            {exercise.isCustom ? (
              <Badge variant="light" color="amber">
                Custom
              </Badge>
            ) : null}
            {exercise.mechanic === null ? null : (
              <Badge variant="light" color="gray">
                {exercise.mechanic}
              </Badge>
            )}
            {exercise.level === null ? null : (
              <Badge variant="light" color="gray">
                {exercise.level}
              </Badge>
            )}
            <Badge variant="light" color="gray">
              {equipmentLabel(exercise.equipment)}
            </Badge>
          </Group>

          <Stack gap={2}>
            <Text size="sm" fw={600}>
              Primary
            </Text>
            <Text size="sm" c="dimmed">
              {exercise.primaryMuscles.map(muscleLabel).join(', ') || '—'}
            </Text>
          </Stack>

          {exercise.secondaryMuscles.length === 0 ? null : (
            <Stack gap={2}>
              <Text size="sm" fw={600}>
                Secondary
              </Text>
              <Text size="sm" c="dimmed">
                {exercise.secondaryMuscles.map(muscleLabel).join(', ')}
              </Text>
            </Stack>
          )}

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
          ) : loading ? (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                Loading instructions…
              </Text>
            </Group>
          ) : details === null || details.instructions.length === 0 ? (
            <Text size="sm" c="dimmed">
              No instructions available.
            </Text>
          ) : (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                Instructions
              </Text>
              <List type="ordered" size="sm" spacing={6}>
                {details.instructions.map((step, position) => (
                  <List.Item key={`${exercise.id}-${String(position)}`}>{step}</List.Item>
                ))}
              </List>
            </Stack>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
