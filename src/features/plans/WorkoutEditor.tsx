import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Collapse,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { MuscleMap } from '@/components/MuscleMap';
import type { Exercise } from '@/domain/exercises';
import type { PlanExerciseSlot, PlanWorkout } from '@/domain/plans';
import { formatPrescription, totalSets } from '@/domain/plans';
import type { MuscleLookup } from '@/domain/volume';
import { SESSION_STOPS, workoutVolume } from '@/domain/volume';
import { ExercisePicker } from './ExercisePicker';
import { SortableList, SortableRow } from './SortableList';

type Props = {
  workout: PlanWorkout;
  index: number;
  total: number;
  lookup: MuscleLookup;
  onRename: (workoutId: string, name: string) => void;
  onRemove: (workoutId: string) => void;
  onMoveWorkout: (from: number, to: number) => void;
  onAddExercise: (workoutId: string, exercise: Exercise) => void;
  onReorderSlots: (workoutId: string, from: number, to: number) => void;
  onEditSlot: (slot: PlanExerciseSlot) => void;
};

export function WorkoutEditor({
  workout,
  index,
  total,
  lookup,
  onRename,
  onRemove,
  onMoveWorkout,
  onAddExercise,
  onReorderSlots,
  onEditSlot,
}: Props) {
  const [name, setName] = useState(workout.name);
  const [picking, setPicking] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const volume = workoutVolume(workout, lookup);
  const slotIds = workout.slots.map((slot) => slot.slotId);

  return (
    <Card withBorder padding="sm">
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap" align="center">
          <TextInput
            aria-label={`Workout ${String(index + 1)} name`}
            placeholder="CHEST + DELTS"
            value={name}
            style={{ flex: 1 }}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            onBlur={() => {
              const trimmed = name.trim();
              if (trimmed !== '' && trimmed !== workout.name) onRename(workout.workoutId, trimmed);
              else if (trimmed === '') setName(workout.name);
            }}
          />
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            disabled={index === 0}
            aria-label={`Move ${workout.name} up`}
            onClick={() => {
              onMoveWorkout(index, index - 1);
            }}
          >
            ↑
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            disabled={index === total - 1}
            aria-label={`Move ${workout.name} down`}
            onClick={() => {
              onMoveWorkout(index, index + 1);
            }}
          >
            ↓
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            size="lg"
            aria-label={`Delete ${workout.name}`}
            onClick={() => {
              onRemove(workout.workoutId);
            }}
          >
            ✕
          </ActionIcon>
        </Group>

        <Group gap="xs">
          <Badge variant="light" color="gray" size="sm">
            {workout.slots.length === 1
              ? '1 exercise'
              : `${String(workout.slots.length)} exercises`}
          </Badge>
          <Badge variant="light" color="gray" size="sm">
            {totalSets(workout)} sets
          </Badge>
        </Group>

        {workout.slots.length === 0 ? (
          <Text size="sm" c="dimmed">
            No exercises yet.
          </Text>
        ) : (
          <SortableList
            ids={slotIds}
            onReorder={(from, to) => {
              onReorderSlots(workout.workoutId, from, to);
            }}
          >
            {workout.slots.map((slot, position) => (
              <SortableRow
                key={slot.slotId}
                id={slot.slotId}
                index={position}
                total={workout.slots.length}
                label={slot.exerciseName}
                onMove={(from, to) => {
                  onReorderSlots(workout.workoutId, from, to);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onEditSlot(slot);
                  }}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'block',
                    width: '100%',
                  }}
                >
                  <Text size="sm" fw={550} lineClamp={1}>
                    {slot.exerciseName}
                    {slot.occurrenceIndex > 0 ? (
                      <Text component="span" size="xs" c="dimmed">
                        {' '}
                        (again)
                      </Text>
                    ) : null}
                  </Text>
                  <Group gap={6}>
                    <Text size="xs" c="dimmed">
                      {formatPrescription(slot.prescription)}
                    </Text>
                    {slot.supersetGroup === null ? null : (
                      <Badge size="xs" variant="light" color="amber">
                        superset
                      </Badge>
                    )}
                  </Group>
                </button>
              </SortableRow>
            ))}
          </SortableList>
        )}

        <Group>
          <Button
            variant="light"
            size="compact-sm"
            onClick={() => {
              setPicking(true);
            }}
          >
            Add exercise
          </Button>
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => {
              setShowMap((open) => !open);
            }}
          >
            {showMap ? 'Hide' : 'What this session hits'}
          </Button>
        </Group>

        <Collapse expanded={showMap}>
          <MuscleMap
            volume={volume}
            stops={SESSION_STOPS}
            scopeLabel="this session"
            testId="session-muscle-map"
          />
        </Collapse>
      </Stack>

      <ExercisePicker
        opened={picking}
        onClose={() => {
          setPicking(false);
        }}
        onPick={(exercise) => {
          onAddExercise(workout.workoutId, exercise);
          setPicking(false);
        }}
      />
    </Card>
  );
}
