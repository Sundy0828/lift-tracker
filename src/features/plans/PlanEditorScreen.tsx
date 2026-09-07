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
import { usePlan } from '@/data/hooks/usePlan';
import { useProfile } from '@/data/hooks/useProfile';
import {
  discardPlanChanges,
  newId,
  publishPlanVersion,
  savePlanDetails,
  savePlanWorkouts,
} from '@/data/mutations/plans';
import type { Exercise } from '@/domain/exercises';
import { diffPlans } from '@/domain/planDiff';
import type { PlanExerciseSlot, PlanWorkout } from '@/domain/plans';
import {
  createRestSlot,
  createSlot,
  estimatePlanSeconds,
  formatEstimate,
  groupWithSlot,
  insertSlotAfter,
  orderedWorkouts,
  reconcileGroups,
  pruneGroupRest,
  reorder,
  totalSets,
  withGroupRounds,
} from '@/domain/plans';
import { WEEKLY_STOPS, planVolume } from '@/domain/volume';
import { PrescriptionEditor, type SlotEdit } from './PrescriptionEditor';
import { VersionHistory } from './VersionHistory';
import { WorkoutEditor } from './WorkoutEditor';

/**
 * The plan editor.
 *
 * Firestore's local cache is the single source of truth: every edit writes
 * through and the listener re-renders from cache immediately, so there is no
 * separate draft state to keep in sync. Only free-text fields keep local
 * state, to stop the cursor jumping mid-word, and save on blur.
 */
export default function PlanEditorScreen() {
  const { planId = null } = useParams();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const { plan, versions, isPending, notFound } = usePlan(planId);
  const { lookup } = useMuscleLookup();
  const { profile } = useProfile();

  const [editingSlot, setEditingSlot] = useState<PlanExerciseSlot | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  if (isPending) return <Skeleton height={400} radius="md" />;

  if (notFound || plan === null) {
    return (
      <Stack>
        <Title order={2}>Plan not found</Title>
        <Button component={Link} to="/plans" variant="light">
          Back to plans
        </Button>
      </Stack>
    );
  }

  const workouts = orderedWorkouts(plan);
  const latestVersion = versions[0];
  const publishedWorkouts = latestVersion?.workouts ?? [];
  const pendingDiff = diffPlans(publishedWorkouts, workouts);
  const volume = planVolume(workouts, lookup);

  const commit = (next: readonly PlanWorkout[]): void => {
    if (uid === null) return;
    // Not awaited: applied to the local cache immediately, flushed on reconnect.
    void savePlanWorkouts(uid, plan.id, next);
  };

  const mapWorkout = (workoutId: string, change: (workout: PlanWorkout) => PlanWorkout): void => {
    commit(
      workouts.map((workout) =>
        // Pruned on every edit so a dissolved circuit cannot leave its round
        // rest behind to be inherited by a later group reusing the id.
        workout.workoutId === workoutId ? pruneGroupRest(change(workout)) : workout,
      ),
    );
  };

  const addWorkout = (): void => {
    // A brand-new workoutId is minted only here: renaming or reordering an
    // existing day keeps its id, which is what preserves its overlay history.
    commit([
      ...workouts,
      { workoutId: newId(), name: `Day ${String(workouts.length + 1)}`, slots: [], groupRest: {} },
    ]);
  };

  const addExercise = (workoutId: string, exercise: Exercise, afterSlotId: string | null): void => {
    mapWorkout(workoutId, (workout) => ({
      ...workout,
      slots: insertSlotAfter(
        workout.slots,
        afterSlotId,
        createSlot(workout.slots, {
          slotId: newId(),
          exerciseId: exercise.id,
          exerciseName: exercise.name,
        }),
      ),
    }));
  };

  const setSlotRest = (workoutId: string, slotId: string, seconds: number | null): void => {
    mapWorkout(workoutId, (workout) => ({
      ...workout,
      slots: workout.slots.map((slot) =>
        slot.slotId === slotId
          ? { ...slot, prescription: { ...slot.prescription, restSeconds: seconds } }
          : slot,
      ),
    }));
  };

  const saveSlot = (slotId: string, edit: SlotEdit): void => {
    commit(
      workouts.map((workout) => ({
        ...workout,
        slots: workout.slots.map((slot) => (slot.slotId === slotId ? { ...slot, ...edit } : slot)),
      })),
    );
  };

  const removeSlot = (slotId: string): void => {
    commit(
      workouts.map((workout) =>
        // Reconciled and pruned: deleting a circuit member can leave the
        // group with one member, or leave a round rest with no group.
        pruneGroupRest({
          ...workout,
          slots: reconcileGroups(workout.slots.filter((slot) => slot.slotId !== slotId)),
        }),
      ),
    );
  };

  const discard = (): void => {
    if (uid === null || !pendingDiff.hasChanges) return;
    void discardPlanChanges(uid, plan.id, publishedWorkouts);
    notifications.show({
      message:
        plan.currentVersion === 0
          ? 'Discarded — this plan has nothing published yet, so it is now empty'
          : `Reverted to v${String(plan.currentVersion)}`,
      color: 'gray',
    });
  };

  const publish = (): void => {
    if (uid === null || !pendingDiff.hasChanges) return;
    const { promise, result } = publishPlanVersion(uid, plan, workouts, publishedWorkouts);
    void promise;
    notifications.show({
      message: `Published v${String(result.versionNumber)} — ${result.changeSummary}`,
      color: 'amber',
    });
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Stack gap={2} style={{ flex: 1 }}>
          <TextInput
            aria-label="Plan name"
            variant="unstyled"
            size="lg"
            fw={650}
            value={name ?? plan.name}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            onBlur={() => {
              const trimmed = (name ?? plan.name).trim();
              if (uid !== null && trimmed !== '' && trimmed !== plan.name) {
                void savePlanDetails(uid, plan.id, { name: trimmed });
              }
              setName(null);
            }}
          />
          <Group gap="xs">
            <Badge variant="light" color="gray" size="sm">
              {workouts.length === 1 ? '1 workout' : `${String(workouts.length)} workouts`}
            </Badge>
            <Badge variant="light" color="gray" size="sm">
              {workouts.reduce((sum, workout) => sum + totalSets(workout), 0)} sets / week
            </Badge>
            {workouts.length === 0 ? null : (
              <Badge variant="light" color="gray" size="sm">
                ~{formatEstimate(estimatePlanSeconds(workouts, profile.defaultRestSeconds))} / week
              </Badge>
            )}
            <Badge variant="light" color={plan.currentVersion === 0 ? 'gray' : 'amber'} size="sm">
              {plan.currentVersion === 0 ? 'unpublished' : `v${String(plan.currentVersion)}`}
            </Badge>
          </Group>
        </Stack>
      </Group>

      {pendingDiff.hasChanges ? (
        <Alert color="amber" variant="light" title="Unpublished changes">
          <Stack gap="xs">
            <Text size="sm">{pendingDiff.summary}</Text>
            <Group>
              <Button size="compact-sm" onClick={publish}>
                Publish v{String(plan.currentVersion + 1)}
              </Button>
              <Button size="compact-sm" variant="default" onClick={discard}>
                {plan.currentVersion === 0
                  ? 'Discard all'
                  : `Discard, back to v${String(plan.currentVersion)}`}
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}

      <Stack gap="sm">
        {workouts.map((workout, index) => (
          <WorkoutEditor
            key={workout.workoutId}
            workout={workout}
            index={index}
            total={workouts.length}
            onRename={(workoutId, nextName) => {
              mapWorkout(workoutId, (current) => ({ ...current, name: nextName }));
            }}
            onRemove={(workoutId) => {
              commit(workouts.filter((current) => current.workoutId !== workoutId));
            }}
            onMoveWorkout={(from, to) => {
              commit(reorder(workouts, from, to));
            }}
            onAddExercise={addExercise}
            onSlotRest={setSlotRest}
            onReorderSlots={(workoutId, from, to) => {
              mapWorkout(workoutId, (current) => ({
                ...current,
                // Reconciled after the move, which is what lets you drag a
                // member out of a circuit to leave it.
                slots: reconcileGroups(reorder(current.slots, from, to)),
              }));
            }}
            onEditSlot={setEditingSlot}
            onRemoveSlot={removeSlot}
            onGroupSlots={(workoutId, activeSlotId, targetSlotId) => {
              mapWorkout(workoutId, (current) => ({
                ...current,
                slots: groupWithSlot(current.slots, activeSlotId, targetSlotId, newId()),
              }));
            }}
            onAddRest={(workoutId, afterSlotId) => {
              mapWorkout(workoutId, (current) => ({
                ...current,
                slots: insertSlotAfter(current.slots, afterSlotId, createRestSlot(newId())),
              }));
            }}
            onRounds={(workoutId, groupId, rounds) => {
              mapWorkout(workoutId, (current) => ({
                ...current,
                slots: withGroupRounds(current.slots, groupId, rounds),
              }));
            }}
            onGroupRest={(workoutId, groupId, seconds) => {
              mapWorkout(workoutId, (current) => ({
                ...current,
                groupRest: { ...current.groupRest, [groupId]: seconds },
              }));
            }}
            defaultRestSeconds={profile.defaultRestSeconds}
          />
        ))}
      </Stack>

      {/* Quiet and sized to its label: adding a *day* is a rare action, and as
          a full-width filled bar it was the loudest control on the screen —
          louder than "Add exercise", which is what you actually reach for. The
          wording says up front that it makes a separate day. */}
      <Group>
        <Button variant="subtle" size="compact-sm" onClick={addWorkout}>
          + Add another day
        </Button>
      </Group>

      <Accordion variant="separated" defaultValue="muscles">
        <Accordion.Item value="muscles">
          <Accordion.Control>Muscle map</Accordion.Control>
          <Accordion.Panel>
            <MuscleMap
              volume={volume}
              stops={WEEKLY_STOPS}
              scopeLabel="across this plan"
              testId="plan-muscle-map"
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="notes">
          <Accordion.Control>Notes</Accordion.Control>
          <Accordion.Panel>
            <Textarea
              aria-label="Plan notes"
              autosize
              minRows={3}
              value={notes ?? plan.notes}
              onChange={(event) => {
                setNotes(event.currentTarget.value);
              }}
              onBlur={() => {
                if (uid !== null && notes !== null && notes !== plan.notes) {
                  void savePlanDetails(uid, plan.id, { notes });
                }
                setNotes(null);
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="versions">
          <Accordion.Control>Version history</Accordion.Control>
          <Accordion.Panel>
            <VersionHistory versions={versions} currentVersion={plan.currentVersion} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Card withBorder padding="sm">
        <Button component={Link} to="/plans" variant="subtle" size="compact-sm">
          Back to plans
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
    </Stack>
  );
}
