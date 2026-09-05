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
import { totalSets } from '@/domain/plans';
import type { MuscleLookup } from '@/domain/volume';
import { SESSION_STOPS, workoutVolume } from '@/domain/volume';
import { ExercisePicker } from './ExercisePicker';
import { SlotList } from './SlotList';

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
  onLinkSlot: (workoutId: string, slotId: string) => void;
  onUnlinkSlot: (workoutId: string, slotId: string) => void;
  onRounds: (workoutId: string, groupId: string, rounds: number) => void;
  onGroupRest: (workoutId: string, groupId: string, seconds: number | null) => void;
  defaultRestSeconds: number;
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
  onLinkSlot,
  onUnlinkSlot,
  onRounds,
  onGroupRest,
  defaultRestSeconds,
}: Props) {
  /**
   * The name field keeps a local draft so the cursor does not jump mid-word,
   * tagged with the committed value it was derived from. When the workout
   * changes underneath — a discard, or another tab — the tag stops matching
   * and the field falls back to the real value instead of showing stale text.
   */
  const [draftName, setDraftName] = useState<{ base: string; value: string } | null>(null);
  const name = draftName?.base === workout.name ? draftName.value : workout.name;

  const [picking, setPicking] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const volume = workoutVolume(workout, lookup);

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
              setDraftName({ base: workout.name, value: event.currentTarget.value });
            }}
            onBlur={() => {
              const trimmed = name.trim();
              if (trimmed !== '' && trimmed !== workout.name) onRename(workout.workoutId, trimmed);
              setDraftName(null);
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
          <SlotList
            workout={workout}
            defaultRestSeconds={defaultRestSeconds}
            onReorder={(from, to) => {
              onReorderSlots(workout.workoutId, from, to);
            }}
            onEditSlot={onEditSlot}
            onLink={(slotId) => {
              onLinkSlot(workout.workoutId, slotId);
            }}
            onUnlink={(slotId) => {
              onUnlinkSlot(workout.workoutId, slotId);
            }}
            onRounds={(groupId, rounds) => {
              onRounds(workout.workoutId, groupId, rounds);
            }}
            onGroupRest={(groupId, seconds) => {
              onGroupRest(workout.workoutId, groupId, seconds);
            }}
          />
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
        workoutName={workout.name}
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
