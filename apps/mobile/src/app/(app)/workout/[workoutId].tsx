import { useAuth } from '@lift/data/hooks/useAuth';
import { useMuscleLookup } from '@lift/data/hooks/useMuscleLookup';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useSchedule } from '@lift/data/hooks/useSchedule';
import { useWorkout } from '@lift/data/hooks/useWorkout';
import { unschedule } from '@lift/data/mutations/schedule';
import {
  archiveWorkout,
  deleteWorkout,
  discardWorkoutChanges,
  newId,
  publishWorkoutVersion,
  saveWorkoutBody,
  saveWorkoutNotes,
} from '@lift/data/mutations/workouts';
import type { Exercise } from '@lift/domain/exercises';
import { SESSION_STOPS, workoutVolume } from '@lift/domain/volume';
import { diffWorkout, hasUnpublishedChanges } from '@lift/domain/workoutDiff';
import type { ExerciseSlot, SlotPlace, WorkoutBody } from '@lift/domain/workouts';
import {
  activeGroupIds,
  createRestSlot,
  createSlot,
  duplicateSlot,
  estimateWorkoutSeconds,
  exerciseSlots,
  formatEstimate,
  groupWithSlot,
  leaveGroup,
  linkToPrevious,
  moveSlot,
  placeSlot,
  pruneGroupRest,
  reconcileGroups,
  totalSets,
  withGroupRounds,
} from '@lift/domain/workouts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform as OS,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DragScrollView } from '../../../components/editor/drag';
import { ExercisePicker } from '../../../components/editor/ExercisePicker';
import { LinkButton, Section } from '../../../components/editor/controls';
import { SlotFace, SlotList } from '../../../components/editor/SlotList';
import { SlotSheet, type SlotEdit } from '../../../components/editor/SlotSheet';
import { VersionHistory } from '../../../components/editor/VersionHistory';
import { MuscleMap } from '../../../components/MuscleMap';
import { SyncStrip } from '../../../components/SyncStrip';
import { Body, Button, Field, Loading, Title } from '../../../components/ui';
import { startWorkout } from '../../../components/WorkoutRow';
import { usePalette } from '../../../theme';

/** How long a notice stays up. */
const NOTICE_MS = 5000;

function back(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/workouts');
}

/**
 * The workout editor: the web's `WorkoutEditorScreen`, edit for edit.
 *
 * Firestore's local cache is the single source of truth. Every edit writes
 * through (not awaited) and the listener re-renders from cache at once, so
 * there is no draft to keep in step, and editing works offline. Only the name
 * and the notes keep local text while typed, and save when editing ends.
 *
 * Every slot change goes through the same `@lift/domain/workouts` functions
 * the web uses, and is pruned the same way, so a workout edited on either app
 * reads identically on the other. Publishing snapshots the working copy as
 * the next version, which is what the web (and every session) reads.
 *
 * Not here yet: sharing (Phase 5).
 */
export default function WorkoutEditor() {
  const palette = usePalette();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workout, versions, isPending, hasPendingWrites, notFound } = useWorkout(workoutId);
  const { profile } = useProfile();
  const { schedule } = useSchedule();
  const { lookup } = useMuscleLookup();

  const [editingSlot, setEditingSlot] = useState<ExerciseSlot | null>(null);
  /** Where a picked exercise lands: the gap whose + Exercise was pressed. */
  const [picking, setPicking] = useState<SlotPlace | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [armedToDelete, setArmedToDelete] = useState(false);
  /** A one-line notice under the header; the phone's stand-in for the web's toasts. */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, NOTICE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);

  if (isPending) return <Loading />;

  if (notFound || workout === null) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={styles.content}>
          <Title>Workout not found</Title>
          <Body dimmed>It may have been deleted on another device.</Body>
          <Button variant="subtle" label="Back" onPress={back} />
        </View>
      </SafeAreaView>
    );
  }

  const body: WorkoutBody = {
    name: workout.name,
    slots: workout.slots,
    groupRest: workout.groupRest,
  };
  // The version list has its own listener, so it is still empty on the first
  // render of a published workout. `currentVersion` is the authority on
  // whether a snapshot exists.
  const published = versions[0] ?? null;
  const pendingDiff = diffWorkout(published, body);
  const hasChanges = hasUnpublishedChanges(published, workout.currentVersion, body);
  const exerciseCount = exerciseSlots(workout.slots).length;
  const hasCircuit = activeGroupIds(workout.slots).length > 0;
  const archived = workout.archivedAt !== null;

  const commit = (next: WorkoutBody): void => {
    if (uid === null) return;
    // Pruned on every edit so a dissolved circuit cannot leave its round rest
    // behind for a later group that reuses the id. Not awaited.
    void saveWorkoutBody(uid, workout.id, pruneGroupRest(next));
  };

  const mapSlots = (change: (slots: readonly ExerciseSlot[]) => ExerciseSlot[]): void => {
    commit({ ...body, slots: change(workout.slots) });
  };

  const groupOf = (slotId: string): string | null =>
    workout.slots.find((slot) => slot.slotId === slotId)?.supersetGroup ?? null;

  const addExercise = (exercise: Exercise, place: SlotPlace): void => {
    mapSlots((slots) =>
      placeSlot(
        slots,
        createSlot(slots, {
          slotId: newId(),
          exerciseId: exercise.id,
          exerciseName: exercise.name,
        }),
        place,
      ),
    );
    setNotice(`Added ${exercise.name}`);
  };

  const removeSlot = (slotId: string): void => {
    // Reconciled: deleting a member can leave a circuit of one, which is just
    // an exercise.
    mapSlots((slots) => reconcileGroups(slots.filter((slot) => slot.slotId !== slotId)));
  };

  const saveSlot = (slotId: string, edit: SlotEdit): void => {
    mapSlots((slots) =>
      slots.map((slot) => (slot.slotId === slotId ? { ...slot, ...edit } : slot)),
    );
  };

  const publish = (): void => {
    if (uid === null || !hasChanges) return;
    const { promise, result } = publishWorkoutVersion(uid, workout, body, published);
    void promise;
    setNotice(`Published v${String(result.versionNumber)}: ${result.changeSummary}`);
  };

  /**
   * Only offered once something is published: with no snapshot there is
   * nothing to go back to, and deleting is the way to abandon a workout that
   * was never published.
   */
  const discard = (): void => {
    if (uid === null || published === null || !hasChanges) return;
    void discardWorkoutChanges(uid, workout.id, published);
    setNotice(`Reverted to v${String(published.versionNumber)}`);
  };

  /** Archiving also takes it off the week, as on the web. Restoring does not put it back. */
  const toggleArchived = (): void => {
    if (uid === null) return;
    void archiveWorkout(uid, workout.id, !archived);
    if (!archived) void unschedule(uid, schedule, workout.id);
    setNotice(archived ? `Restored ${workout.name}` : `Archived ${workout.name}`);
  };

  /** Deletes the workout and leaves. Published versions stay for history. */
  const remove = (): void => {
    if (uid === null) return;
    setArmedToDelete(false);
    void deleteWorkout(uid, workout.id);
    back();
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      <SyncStrip />
      <KeyboardAvoidingView style={styles.root} behavior={OS.OS === 'ios' ? 'padding' : undefined}>
        <DragScrollView
          contentContainerStyle={styles.content}
          // Two rows already in one circuit have nothing to join, so hovering
          // there stays a move.
          canGroup={(slotId, targetId) => {
            const group = groupOf(slotId);
            return group === null || group !== groupOf(targetId);
          }}
          onDropGap={(slotId, place) => {
            mapSlots((slots) => moveSlot(slots, slotId, place));
          }}
          onDropGroup={(slotId, targetId) => {
            mapSlots((slots) => groupWithSlot(slots, slotId, targetId, newId()));
          }}
          renderDragged={(slotId) => {
            const slot = workout.slots.find((item) => item.slotId === slotId);
            return slot === undefined ? null : (
              <SlotFace slot={slot} inCircuit={slot.supersetGroup !== null} />
            );
          }}
        >
          <Pressable accessibilityRole="button" hitSlop={8} onPress={back}>
            <Text style={[styles.link, { color: palette.dimmed }]}>‹ Workouts</Text>
          </Pressable>

          <TextInput
            accessibilityLabel="Workout name"
            value={name ?? workout.name}
            onChangeText={setName}
            onEndEditing={() => {
              const trimmed = (name ?? workout.name).trim();
              if (trimmed !== '' && trimmed !== workout.name) commit({ ...body, name: trimmed });
              setName(null);
            }}
            returnKeyType="done"
            style={[styles.name, { color: palette.text }]}
          />

          <Text style={[styles.small, { color: palette.dimmed }]}>
            {exerciseCount === 1 ? '1 exercise' : `${String(exerciseCount)} exercises`} ·{' '}
            {String(totalSets(body))} sets
            {workout.slots.length === 0
              ? ''
              : ` · ~${formatEstimate(estimateWorkoutSeconds(body, profile.defaultRestSeconds))}`}{' '}
            · {workout.currentVersion === 0 ? 'unpublished' : `v${String(workout.currentVersion)}`}
            {/* Every edit lands in the local cache at once, so "saved here"
                and "saved everywhere" would look the same without this. */}
            {hasPendingWrites ? ' · saving…' : ' · saved'}
            {archived ? ' · archived' : ''}
          </Text>

          {notice === null ? null : (
            <Pressable
              accessibilityLiveRegion="polite"
              onPress={() => {
                setNotice(null);
              }}
              style={[styles.notice, { backgroundColor: palette.syncing }]}
            >
              <Text style={[styles.small, { color: palette.text }]}>{notice}</Text>
            </Pressable>
          )}

          {exerciseCount > 0 ? (
            <Button
              label="Start this workout"
              onPress={() => {
                startWorkout(workout.id);
              }}
            />
          ) : null}

          {hasChanges ? (
            <View
              style={[
                styles.changes,
                { borderColor: palette.accent, backgroundColor: palette.surface },
              ]}
            >
              <Text style={[styles.changesTitle, { color: palette.text }]}>
                Unpublished changes
              </Text>
              <Text style={[styles.small, { color: palette.text }]}>{pendingDiff.summary}</Text>
              <Text style={[styles.small, { color: palette.dimmed }]}>
                Every edit is already saved, here and on the web. Publishing snapshots it as v
                {String(workout.currentVersion + 1)}: history reads sessions against their version,
                and share links send one. Starting the workout publishes it for you.
              </Text>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <Button
                    label={`Publish v${String(workout.currentVersion + 1)}`}
                    onPress={publish}
                  />
                </View>
                {published === null ? null : (
                  <View style={styles.grow}>
                    <Button
                      variant="subtle"
                      label={`Back to v${String(published.versionNumber)}`}
                      onPress={discard}
                    />
                  </View>
                )}
              </View>
            </View>
          ) : null}

          {workout.slots.length === 0 ? (
            <Body dimmed>No exercises yet. Add the first one below.</Body>
          ) : null}

          {/* Rendered even when empty: its top insert row adds the first exercise. */}
          <SlotList
            slots={workout.slots}
            groupRest={workout.groupRest}
            defaultRestSeconds={profile.defaultRestSeconds}
            onEditSlot={setEditingSlot}
            onAdd={setPicking}
            onAddRest={(place) => {
              mapSlots((slots) => placeSlot(slots, createRestSlot(newId()), place));
            }}
            onRemoveSlot={removeSlot}
            onDuplicateSlot={(slotId) => {
              mapSlots((slots) => duplicateSlot(slots, slotId, newId()));
            }}
            onJoinAbove={(slotId) => {
              mapSlots((slots) => reconcileGroups(linkToPrevious(slots, slotId, newId())));
            }}
            onLeaveCircuit={(slotId, placeBefore) => {
              mapSlots((slots) => leaveGroup(slots, slotId, placeBefore));
            }}
            onRounds={(groupId, rounds) => {
              mapSlots((slots) => withGroupRounds(slots, groupId, rounds));
            }}
            onGroupRest={(groupId, seconds) => {
              commit({ ...body, groupRest: { ...body.groupRest, [groupId]: seconds } });
            }}
          />

          {/* One hint, and each half only once it applies, as on the web. */}
          {workout.slots.length === 0 ? null : (
            <Text style={[styles.small, { color: palette.dimmed }]}>
              Tap a row to edit it. Hold a row to drag it.
              {exerciseCount > 1
                ? ' Drag it onto another and hold for a moment to make them a circuit.'
                : ''}
              {hasCircuit ? ' To leave a circuit, drag the row out of its card.' : ''} Swiping a row
              does the same things.
            </Text>
          )}

          <Section title="Muscle map" initiallyOpen>
            {/* Session bands, not weekly: one workout is one session's work. */}
            <MuscleMap
              volume={workoutVolume(body, lookup)}
              stops={SESSION_STOPS}
              scopeLabel="this workout"
              basis="planned"
            />
          </Section>

          <Section title="Notes" summary={workout.notes === '' ? 'none' : 'saved'}>
            <Field
              label="Workout notes"
              multiline
              value={notes ?? workout.notes}
              onChangeText={setNotes}
              onEndEditing={() => {
                if (uid !== null && notes !== null && notes !== workout.notes) {
                  void saveWorkoutNotes(uid, workout.id, notes);
                }
                setNotes(null);
              }}
              style={styles.notes}
            />
          </Section>

          <Section
            title="Version history"
            summary={versions.length === 0 ? 'none' : `${String(versions.length)} published`}
          >
            <VersionHistory versions={versions} currentVersion={workout.currentVersion} />
          </Section>

          {/* A plain card, not a fold, as on the web: it is the last thing on the
              screen, and a delete that is one tap from view is easy to find. */}
          <View style={[styles.danger, { borderColor: palette.border }]}>
            <Body dimmed>
              Archiving moves it to the bottom of the list and takes it off your week. Deleting
              removes it. Sessions you already logged stay in history either way.
            </Body>
            <Button
              variant="subtle"
              label={archived ? 'Restore workout' : 'Archive workout'}
              onPress={toggleArchived}
            />
            {armedToDelete ? (
              <View style={styles.row}>
                <LinkButton label="Delete for good" tone="danger" onPress={remove} />
                <LinkButton
                  label="Keep it"
                  onPress={() => {
                    setArmedToDelete(false);
                  }}
                />
              </View>
            ) : (
              <LinkButton
                label="Delete workout"
                tone="danger"
                onPress={() => {
                  setArmedToDelete(true);
                }}
              />
            )}
          </View>
        </DragScrollView>
      </KeyboardAvoidingView>

      <SlotSheet
        slot={editingSlot}
        inCircuit={editingSlot !== null && groupOf(editingSlot.slotId) !== null}
        defaultRestSeconds={profile.defaultRestSeconds}
        onClose={() => {
          setEditingSlot(null);
        }}
        onSave={saveSlot}
        onRemove={removeSlot}
      />

      <ExercisePicker
        visible={picking !== null}
        onClose={() => {
          setPicking(null);
        }}
        onPick={(exercise) => {
          if (picking !== null) addExercise(exercise, picking);
          setPicking(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  link: { fontSize: 15, fontWeight: '600' },
  // The web's name field: size lg, weight 650.
  name: { fontSize: 20, fontWeight: '700', paddingVertical: 2 },
  small: { fontSize: 12, lineHeight: 17 },
  notice: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  changes: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 6 },
  changesTitle: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  grow: { flex: 1 },
  danger: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8, alignItems: 'flex-start' },
  notes: { minHeight: 96, paddingTop: 10, textAlignVertical: 'top' },
});
