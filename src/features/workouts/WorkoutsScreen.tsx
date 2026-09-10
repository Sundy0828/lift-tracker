import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useProfile } from '@/data/hooks/useProfile';
import { useWorkouts } from '@/data/hooks/useWorkouts';
import { archiveWorkout, createWorkout, newId } from '@/data/mutations/workouts';
import {
  estimateWorkoutSeconds,
  exerciseSlots,
  formatEstimate,
  totalSets,
} from '@/domain/workouts';

/**
 * The workout library: PUSH, PULL, ABS — each a reusable list you start on
 * whatever cadence you like.
 *
 * There is deliberately no plan or week above this. A workout is the unit you
 * build, publish and perform, so pairing ABS with PUSH on Monday and with PULL
 * on Wednesday needs nothing more than starting both — and ABS keeps one
 * continuous history either way, because there is only one ABS.
 */
export default function WorkoutsScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workouts, isPending } = useWorkouts();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const active = workouts.filter((workout) => workout.archivedAt === null);
  const archived = workouts.filter((workout) => workout.archivedAt !== null);

  const create = (): void => {
    const trimmed = name.trim();
    if (uid === null || trimmed === '') return;

    const workoutId = newId();
    // Not awaited: the workout appears from the local cache immediately.
    void createWorkout(uid, workoutId, trimmed);
    setCreating(false);
    setName('');
    void navigate(`/workouts/${workoutId}`);
  };

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Workouts</Title>
        <Button
          size="compact-md"
          onClick={() => {
            setCreating(true);
          }}
        >
          New
        </Button>
      </Group>

      {isPending ? (
        <Skeleton height={120} radius="md" />
      ) : active.length === 0 ? (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600}>No workouts yet</Text>
            <Text size="sm" c="dimmed">
              A workout is one named list you actually do — PUSH, ABS, CHEST + DELTS. Build them
              separately and do them in whatever combination a day calls for.
            </Text>
            <Button
              variant="light"
              onClick={() => {
                setCreating(true);
              }}
            >
              Create your first workout
            </Button>
          </Stack>
        </Card>
      ) : (
        active.map((workout) => {
          const exercises = exerciseSlots(workout.slots);

          return (
            <Card key={workout.id} withBorder padding="sm" data-testid="workout-card">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    component={Link}
                    to={`/workouts/${workout.id}`}
                    fw={600}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    {workout.name}
                  </Text>
                  <Group gap="xs">
                    <Badge variant="light" color="gray" size="sm">
                      {exercises.length === 1
                        ? '1 exercise'
                        : `${String(exercises.length)} exercises`}
                    </Badge>
                    <Badge variant="light" color="gray" size="sm">
                      {totalSets(workout)} sets
                    </Badge>
                    {workout.slots.length === 0 ? null : (
                      <Badge variant="light" color="gray" size="sm">
                        ~
                        {formatEstimate(
                          estimateWorkoutSeconds(workout, profile.defaultRestSeconds),
                        )}
                      </Badge>
                    )}
                    <Badge
                      variant="light"
                      color={workout.currentVersion === 0 ? 'gray' : 'sky'}
                      size="sm"
                    >
                      {workout.currentVersion === 0
                        ? 'unpublished'
                        : `v${String(workout.currentVersion)}`}
                    </Badge>
                  </Group>
                  {exercises.length > 0 ? (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {exercises.map((slot) => slot.exerciseName).join(' · ')}
                    </Text>
                  ) : null}
                </Stack>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={`Archive ${workout.name}`}
                  onClick={() => {
                    if (uid !== null) void archiveWorkout(uid, workout.id, true);
                  }}
                >
                  ▽
                </ActionIcon>
              </Group>
            </Card>
          );
        })
      )}

      {archived.length > 0 ? (
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed">
            Archived
          </Text>
          {archived.map((workout) => (
            <Card key={workout.id} withBorder padding="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {workout.name}
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => {
                    if (uid !== null) void archiveWorkout(uid, workout.id, false);
                  }}
                >
                  Restore
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      ) : null}

      <Modal
        opened={creating}
        onClose={() => {
          setCreating(false);
        }}
        title="New workout"
      >
        <Stack>
          <TextInput
            label="Workout name"
            placeholder="PUSH"
            required
            data-autofocus
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create();
            }}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setCreating(false);
              }}
            >
              Cancel
            </Button>
            <Button disabled={name.trim() === ''} onClick={create}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
