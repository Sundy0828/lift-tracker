import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { MuscleMap } from '@/components/MuscleMap';
import { useAuth } from '@/data/hooks/useAuth';
import { useMuscleLookup } from '@/data/hooks/useMuscleLookup';
import { useProfile } from '@/data/hooks/useProfile';
import { useWorkout } from '@/data/hooks/useWorkout';
import {
  discardWorkoutChanges,
  newId,
  publishWorkoutVersion,
  saveWorkoutBody,
  saveWorkoutNotes,
} from '@/data/mutations/workouts';
import type { Exercise } from '@/domain/exercises';
import { diffWorkout } from '@/domain/workoutDiff';
import type { ExerciseSlot, WorkoutBody } from '@/domain/workouts';
import {
  activeGroupIds,
  createRestSlot,
  createSlot,
  estimateWorkoutSeconds,
  exerciseSlots,
  formatEstimate,
  groupWithSlot,
  insertSlotAfter,
  pruneGroupRest,
  reconcileGroups,
  reorder,
  totalSets,
  ungroup,
  unlink,
  withGroupRounds,
} from '@/domain/workouts';
import { SESSION_STOPS, workoutVolume } from '@/domain/volume';
import { ExercisePicker } from './ExercisePicker';
import { PrescriptionEditor, type SlotEdit } from './PrescriptionEditor';
import { SlotList } from './SlotList';
import { VersionHistory } from './VersionHistory';
import classes from './WorkoutEditorScreen.module.css';

/**
 * The workout editor: one named, reusable exercise list — PUSH, ABS, PULL.
 *
 * There is no plan container above it, so this screen is the whole editor:
 * the name, the slots, and the publish state of one workout. What you train on
 * a given day is simply which workouts you start.
 *
 * Firestore's local cache is the single source of truth: every edit writes
 * through and the listener re-renders from cache immediately, so there is no
 * separate draft state to keep in sync. Only free-text fields keep local
 * state, to stop the cursor jumping mid-word, and save on blur.
 */
export default function WorkoutEditorScreen() {
  const { workoutId = null } = useParams();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const { workout, versions, isPending, notFound } = useWorkout(workoutId);
  const { lookup } = useMuscleLookup();
  const { profile } = useProfile();

  const [editingSlot, setEditingSlot] = useState<ExerciseSlot | null>(null);
  /**
   * Where a newly picked exercise lands: after this slot, or at the start when
   * null. `join` is false for the insert row below a circuit, which lands the
   * exercise after the block rather than inside it.
   */
  const [picking, setPicking] = useState<{ afterSlotId: string | null; join: boolean } | null>(
    null,
  );
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  if (isPending) return <Skeleton height={400} radius="md" />;

  if (notFound || workout === null) {
    return (
      <Stack>
        <Title order={2}>Workout not found</Title>
        <Button component={Link} to="/workouts" variant="light">
          Back to workouts
        </Button>
      </Stack>
    );
  }

  const body: WorkoutBody = {
    name: workout.name,
    slots: workout.slots,
    groupRest: workout.groupRest,
  };
  const published = versions[0] ?? null;
  const pendingDiff = diffWorkout(published, body);
  const volume = workoutVolume(body, lookup);
  const exerciseCount = exerciseSlots(workout.slots).length;
  const hasCircuit = activeGroupIds(workout.slots).length > 0;

  const commit = (next: WorkoutBody): void => {
    if (uid === null) return;
    // Pruned on every edit so a dissolved circuit cannot leave its round rest
    // behind to be inherited by a later group reusing the id.
    // Not awaited: applied to the local cache immediately, flushed on reconnect.
    void saveWorkoutBody(uid, workout.id, pruneGroupRest(next));
  };

  const mapSlots = (change: (slots: readonly ExerciseSlot[]) => ExerciseSlot[]): void => {
    commit({ ...body, slots: change(workout.slots) });
  };

  const addExercise = (exercise: Exercise, afterSlotId: string | null, join: boolean): void => {
    mapSlots((slots) =>
      insertSlotAfter(
        slots,
        afterSlotId,
        createSlot(slots, {
          slotId: newId(),
          exerciseId: exercise.id,
          exerciseName: exercise.name,
        }),
        join,
      ),
    );
  };

  const setSlotRest = (slotId: string, seconds: number | null): void => {
    mapSlots((slots) =>
      slots.map((slot) =>
        slot.slotId === slotId
          ? { ...slot, prescription: { ...slot.prescription, restSeconds: seconds } }
          : slot,
      ),
    );
  };

  const saveSlot = (slotId: string, edit: SlotEdit): void => {
    mapSlots((slots) =>
      slots.map((slot) => (slot.slotId === slotId ? { ...slot, ...edit } : slot)),
    );
  };

  const removeSlot = (slotId: string): void => {
    // Reconciled: deleting a circuit member can leave the group with one
    // member, which is just an exercise.
    mapSlots((slots) => reconcileGroups(slots.filter((slot) => slot.slotId !== slotId)));
  };

  /**
   * Only offered once something is published: with no snapshot there is
   * nothing to go back *to*, and a button that emptied the list instead would
   * be a destructive action wearing an undo's clothes. Deleting the workout
   * is the way to abandon one that was never published.
   */
  const discard = (): void => {
    if (uid === null || published === null || !pendingDiff.hasChanges) return;
    void discardWorkoutChanges(uid, workout.id, published);
    notifications.show({
      message: `Reverted to v${String(published.versionNumber)}`,
      color: 'gray',
    });
  };

  const publish = (): void => {
    if (uid === null || !pendingDiff.hasChanges) return;
    const { promise, result } = publishWorkoutVersion(uid, workout, body, published);
    void promise;
    notifications.show({
      message: `Published v${String(result.versionNumber)} — ${result.changeSummary}`,
      color: 'amber',
    });
  };

  return (
    <Stack>
      <Stack gap={2}>
        <TextInput
          aria-label="Workout name"
          variant="unstyled"
          size="lg"
          fw={650}
          value={name ?? workout.name}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
          onBlur={() => {
            const trimmed = (name ?? workout.name).trim();
            if (trimmed !== '' && trimmed !== workout.name) commit({ ...body, name: trimmed });
            setName(null);
          }}
        />
        <Group gap="xs">
          <Badge variant="light" color="gray" size="sm">
            {/* Exercises, not rows: a rest row is a pause, not an exercise. */}
            {exerciseCount === 1 ? '1 exercise' : `${String(exerciseCount)} exercises`}
          </Badge>
          <Badge variant="light" color="gray" size="sm">
            {totalSets(body)} sets
          </Badge>
          {workout.slots.length === 0 ? null : (
            <Badge variant="light" color="gray" size="sm">
              ~{formatEstimate(estimateWorkoutSeconds(body, profile.defaultRestSeconds))}
            </Badge>
          )}
          <Badge variant="light" color={workout.currentVersion === 0 ? 'gray' : 'amber'} size="sm">
            {workout.currentVersion === 0 ? 'unpublished' : `v${String(workout.currentVersion)}`}
          </Badge>
        </Group>
      </Stack>

      {pendingDiff.hasChanges ? (
        <Alert color="amber" variant="light" title="Unpublished changes">
          <Stack gap="xs">
            <Text size="sm">{pendingDiff.summary}</Text>
            <Group>
              <Button size="compact-sm" onClick={publish}>
                Publish v{String(workout.currentVersion + 1)}
              </Button>
              {published === null ? null : (
                <Button size="compact-sm" variant="default" onClick={discard}>
                  Discard, back to v{String(published.versionNumber)}
                </Button>
              )}
            </Group>
          </Stack>
        </Alert>
      ) : null}

      {workout.slots.length === 0 ? (
        <Text size="sm" c="dimmed">
          No exercises yet.
        </Text>
      ) : null}

      {/*
        Rendered even when the workout is empty: the list's top insert row is
        the only way to add the first exercise.
      */}
      <SlotList
        workout={body}
        defaultRestSeconds={profile.defaultRestSeconds}
        onReorder={(from, to) => {
          // Reconciled after the move, which is what lets you drag a member
          // out of a circuit to leave it.
          mapSlots((slots) => reconcileGroups(reorder(slots, from, to)));
        }}
        onEditSlot={setEditingSlot}
        onRemoveSlot={removeSlot}
        onGroup={(activeSlotId, targetSlotId) => {
          mapSlots((slots) => groupWithSlot(slots, activeSlotId, targetSlotId, newId()));
        }}
        onLeaveCircuit={(slotId) => {
          mapSlots((slots) => unlink(slots, slotId));
        }}
        onUngroup={(groupId) => {
          mapSlots((slots) => ungroup(slots, groupId));
        }}
        onAddAfter={(slotId, join) => {
          setPicking({ afterSlotId: slotId, join });
        }}
        onAddRestAfter={(slotId, join) => {
          mapSlots((slots) => insertSlotAfter(slots, slotId, createRestSlot(newId()), join));
        }}
        onRestSeconds={setSlotRest}
        onRounds={(groupId, rounds) => {
          mapSlots((slots) => withGroupRounds(slots, groupId, rounds));
        }}
        onGroupRest={(groupId, seconds) => {
          commit({ ...body, groupRest: { ...body.groupRest, [groupId]: seconds } });
        }}
      />

      {/* One hint line, not one per gesture, and each half only appears once
          it applies: grouping needs something to group with, leaving needs a
          circuit to leave. */}
      {workout.slots.length === 0 ? null : (
        <Text size="xs" c="dimmed">
          Swipe a row left to delete it.
          {exerciseCount > 1 ? (
            <>
              {' '}
              Drag an exercise onto another and hold for a moment to make them a circuit, or press{' '}
              <kbd className={classes.kbd}>g</kbd> while dragging.
            </>
          ) : null}
          {hasCircuit
            ? ' Swipe a member right to take it out of a circuit, or use Ungroup to take the whole circuit apart.'
            : null}
        </Text>
      )}

      <Accordion variant="separated" defaultValue="muscles">
        <Accordion.Item value="muscles">
          <Accordion.Control>Muscle map</Accordion.Control>
          <Accordion.Panel>
            {/* Session bands, not weekly: one workout is one session's work,
                and with no plan above it nothing here knows your week. */}
            <MuscleMap
              volume={volume}
              stops={SESSION_STOPS}
              scopeLabel="this workout"
              testId="workout-muscle-map"
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="notes">
          <Accordion.Control>Notes</Accordion.Control>
          <Accordion.Panel>
            <Textarea
              aria-label="Workout notes"
              autosize
              minRows={3}
              value={notes ?? workout.notes}
              onChange={(event) => {
                setNotes(event.currentTarget.value);
              }}
              onBlur={() => {
                if (uid !== null && notes !== null && notes !== workout.notes) {
                  void saveWorkoutNotes(uid, workout.id, notes);
                }
                setNotes(null);
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="versions">
          <Accordion.Control>Version history</Accordion.Control>
          <Accordion.Panel>
            <VersionHistory versions={versions} currentVersion={workout.currentVersion} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Card withBorder padding="sm">
        <Button component={Link} to="/workouts" variant="subtle" size="compact-sm">
          Back to workouts
        </Button>
      </Card>

      <PrescriptionEditor
        slot={editingSlot}
        onClose={() => {
          setEditingSlot(null);
        }}
        onSave={saveSlot}
        onRemove={removeSlot}
      />

      <ExercisePicker
        opened={picking !== null}
        workoutName={workout.name}
        onClose={() => {
          setPicking(null);
        }}
        onPick={(exercise) => {
          addExercise(exercise, picking?.afterSlotId ?? null, picking?.join ?? true);
          setPicking(null);
        }}
      />
    </Stack>
  );
}
