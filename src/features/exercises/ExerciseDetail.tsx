import { Badge, Group, List, Loader, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { loadExerciseDetails } from '@/catalog';
import { MuscleFocus } from '@/components/MuscleMap/MuscleFocus';
import type { Exercise, ExerciseDetails } from '@/domain/exercises';
import { catalogImageUrls, equipmentLabel } from '@/domain/exercises';
import classes from './ExerciseDetail.module.css';

/**
 * The body of an exercise detail view: both movement frames, the muscles it
 * works, and its instructions. Shared by the browse drawer and the workout
 * picker's preview so the two can never drift.
 *
 * The two images are the start and end position of the lift, which is the
 * fastest way to tell near-identical names apart.
 */

/**
 * The start and end frames, or nothing at all.
 *
 * **An exercise with no pictures renders no picture area.** A custom lift
 * never has any and most of the panel below is still worth reading, so a row
 * of empty boxes — or a line apologising for them — is a third of the screen
 * spent saying nothing.
 *
 * Images that fail collapse the same way. That is the offline case, and it
 * gets one quiet line rather than two placeholders.
 */
function Frames({ exercise }: { exercise: Exercise }) {
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const urls = catalogImageUrls(exercise);

  if (urls.length === 0) return null;

  if (urls.every((_, position) => failed.has(position))) {
    return (
      <Text size="xs" c="dimmed">
        Pictures need a connection — they are cached once you have seen them.
      </Text>
    );
  }

  return (
    <div className={classes.frames}>
      {urls.map((url, position) =>
        failed.has(position) ? null : (
          <figure key={url} className={classes.frame}>
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
            <figcaption className={classes.frameCaption}>
              {position === 0 ? 'Start' : 'Finish'}
            </figcaption>
          </figure>
        ),
      )}
    </div>
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
          <Badge variant="light" color="sky">
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

      <MuscleFocus
        primary={exercise.primaryMuscles}
        secondary={exercise.secondaryMuscles}
        testId="muscle-focus"
      />

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
