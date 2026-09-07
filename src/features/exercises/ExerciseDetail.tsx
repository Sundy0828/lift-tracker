import { Badge, Group, List, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { loadExerciseDetails } from '@/catalog';
import type { Exercise, ExerciseDetails } from '@/domain/exercises';
import { catalogImageUrls, equipmentLabel } from '@/domain/exercises';
import { muscleLabel } from '@/domain/muscles';
import classes from './ExerciseDetail.module.css';

/**
 * The body of an exercise detail view: both movement frames, the muscles it
 * works, and its instructions. Shared by the browse drawer and the workout
 * picker's preview so the two can never drift.
 *
 * The two images are the start and end position of the lift, which is the
 * fastest way to tell near-identical names apart.
 */

function Frames({ exercise }: { exercise: Exercise }) {
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const urls = catalogImageUrls(exercise);

  if (urls.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {exercise.isCustom ? 'Custom exercises have no pictures.' : 'No pictures available.'}
      </Text>
    );
  }

  const allFailed = urls.every((_, position) => failed.has(position));

  return (
    <Stack gap={4}>
      <div className={classes.frames}>
        {urls.map((url, position) => (
          <figure key={url} className={classes.frame}>
            {failed.has(position) ? (
              // The frame keeps its place rather than disappearing: losing the
              // picture should not also lose the Start/Finish structure.
              <div className={classes.missing} aria-hidden="true">
                ◍
              </div>
            ) : (
              <img
                className={classes.image}
                src={url}
                alt={`${exercise.name}, position ${String(position + 1)}`}
                loading="lazy"
                decoding="async"
                onError={() => {
                  setFailed((current) => new Set(current).add(position));
                }}
              />
            )}
            <figcaption className={classes.frameCaption}>
              {position === 0 ? 'Start' : 'Finish'}
            </figcaption>
          </figure>
        ))}
      </div>
      {allFailed ? (
        <Text size="xs" c="dimmed">
          Pictures need a connection — they are cached once you have seen them.
        </Text>
      ) : null}
    </Stack>
  );
}

export function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  const id = exercise.id;
  const isCustom = exercise.isCustom;

  // Tagged with the id it belongs to, so opening a second exercise shows a
  // loading state rather than the first one's instructions.
  const [loaded, setLoaded] = useState<{ id: string; details: ExerciseDetails | null } | null>(
    null,
  );

  useEffect(() => {
    if (isCustom) return;

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
  const loading = !isCustom && loaded?.id !== id;

  return (
    <Stack gap="sm">
      <Frames exercise={exercise} />

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
        {exercise.force === null ? null : (
          <Badge variant="light" color="gray">
            {exercise.force}
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

      {isCustom ? null : loading ? (
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
  );
}
