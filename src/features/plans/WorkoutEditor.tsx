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
import { estimateWorkoutSeconds, formatEstimate, totalSets } from '@/domain/plans';
import type { MuscleLookup } from '@/domain/volume';
import { SESSION_STOPS, workoutVolume } from '@/domain/volume';
import { ExercisePicker } from './ExercisePicker';
import { SlotList } from './SlotList';
import classes from './WorkoutEditor.module.css';

type Props = {
  workout: PlanWorkout;
  index: number;
  total: number;
  lookup: MuscleLookup;
  onRename: (workoutId: string, name: string) => void;
  onRemove: (workoutId: string) => void;
  onMoveWorkout: (from: number, to: number) => void;
  /** `afterSlotId` is null when appending at the end of the workout. */
  onAddExercise: (workoutId: string, exercise: Exercise, afterSlotId: string | null) => void;
  onSlotRest: (workoutId: string, slotId: string, seconds: number | null) => void;
  onReorderSlots: (workoutId: string, from: number, to: number) => void;
  onEditSlot: (slot: PlanExerciseSlot) => void;
  onGroupSlots: (workoutId: string, activeSlotId: string, targetSlotId: string) => void;
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
  onSlotRest,
  onReorderSlots,
  onEditSlot,
  onGroupSlots,
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

  /**
   * Where a newly picked exercise lands: after this slot, or at the end when
   * null. Set by the + on a row, so an addition needs no follow-up drag.
   */
  const [picking, setPicking] = useState<{ afterSlotId: string | null } | null>(null);
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
          {workout.slots.length === 0 ? null : (
            <Badge variant="light" color="gray" size="sm">
              ~{formatEstimate(estimateWorkoutSeconds(workout, defaultRestSeconds))}
            </Badge>
          )}
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
            onGroup={(activeSlotId, targetSlotId) => {
              onGroupSlots(workout.workoutId, activeSlotId, targetSlotId);
            }}
            onUnlink={(slotId) => {
              onUnlinkSlot(workout.workoutId, slotId);
            }}
            onAddAfter={(slotId) => {
              setPicking({ afterSlotId: slotId });
            }}
            onSlotRest={(slotId, seconds) => {
              onSlotRest(workout.workoutId, slotId, seconds);
            }}
            onRounds={(groupId, rounds) => {
              onRounds(workout.workoutId, groupId, rounds);
            }}
            onGroupRest={(groupId, seconds) => {
              onGroupRest(workout.workoutId, groupId, seconds);
            }}
          />
        )}

        {workout.slots.length > 1 ? (
          <Text size="xs" c="dimmed">
            Drag an exercise onto another and hold for a moment to make them a circuit, or press{' '}
            <kbd className={classes.kbd}>g</kbd> while dragging.
          </Text>
        ) : null}

        <Group>
          <Button
            variant="light"
            size="compact-sm"
            onClick={() => {
              setPicking({ afterSlotId: null });
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
        opened={picking !== null}
        workoutName={workout.name}
        onClose={() => {
          setPicking(null);
        }}
        onPick={(exercise) => {
          onAddExercise(workout.workoutId, exercise, picking?.afterSlotId ?? null);
          setPicking(null);
        }}
      />
    </Card>
  );
}
