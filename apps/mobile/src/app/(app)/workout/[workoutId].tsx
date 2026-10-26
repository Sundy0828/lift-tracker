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
import type { ExerciseSlot, SlotPlace, Workout, WorkoutBody } from '@lift/domain/workouts';
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
  parseSlots,
  placeSlot,
  pruneGroupRest,
  reconcileGroups,
  reorder,
  totalSets,
  withGroupRounds,
} from '@lift/domain/workouts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { Section, useDraft } from '../../../components/editor/controls';
import { SlotFace, SlotList } from '../../../components/editor/SlotList';
import { SlotSheet, type SlotEdit } from '../../../components/editor/SlotSheet';
import { VersionHistory } from '../../../components/editor/VersionHistory';
import { MuscleMap } from '../../../components/MuscleMap';
import { SharePanel } from '../../../components/sharing/SharePanel';
import { SyncStrip } from '../../../components/SyncStrip';
import {
  BackArrow,
  Badge,
  Body,
  Button,
  Field,
  Loading,
  Notice,
  Row,
  Title,
} from '../../../components/ui';
import { useStartWorkout } from '../../../components/WorkoutRow';
import { usePalette } from '../../../theme';

/** How long a notice stays up. */
const NOTICE_MS = 5000;

/** The folds under the list. One open at a time, as the web's Accordion. */
type Fold = 'muscles' | 'notes' | 'versions' | 'share';

function back(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/workouts');
}

/**
 * Whether a snapshot shows a body this screen wrote. Round rest is checked
 * entry by entry: the write merges it, so the snapshot may keep extra keys.
 */
function reflects(workout: Workout, written: WorkoutBody): boolean {
  return (
    workout.name === written.name &&
    JSON.stringify(workout.slots) === JSON.stringify(parseSlots(written.slots)) &&
    Object.entries(written.groupRest).every(
      ([groupId, seconds]) => workout.groupRest[groupId] === seconds,
    )
  );
}

/**
 * The workout editor: the web's `WorkoutEditorScreen`, edit for edit.
 *
 * Firestore's local cache is the single source of truth. Every edit writes
 * through (not awaited) and the listener re-renders from cache at once, so
 * there is no draft to keep in step, and editing works offline. Only the name
 * and the notes keep local text while typed, and save when editing ends or
 * the field goes away. Until the listener catches up, the next edit builds on
 * the last body written rather than the render's.
 *
 * Every slot change goes through the same `@lift/domain/workouts` functions
 * the web uses, and is pruned the same way, so a workout edited on either app
 * reads identically on the other. Publishing snapshots the working copy as
 * the next version, which is what the web (and every session) reads, and
 * what a share link carries.
 */
export default function WorkoutEditor() {
  const startWorkout = useStartWorkout();
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
  const [armedToDelete, setArmedToDelete] = useState(false);
  const [fold, setFold] = useState<Fold | null>('muscles');
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

  /**
   * The last body written, until a snapshot shows it. Edits build on this, so
   * two made before the listener fires do not both start from one render, the
   * second undoing the first.
   */
  const written = useRef<WorkoutBody | null>(null);
  useEffect(() => {
    if (written.current === null || workout === null) return;
    // Nothing left to sync means the snapshot is at least as new as the write.
    if (!hasPendingWrites || reflects(workout, written.current)) written.current = null;
  }, [workout, hasPendingWrites]);

  if (isPending) return <Loading />;

  if (notFound || workout === null) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={styles.content}>
          <Title>Workout not found</Title>
          <Body dimmed>It may have been deleted on another device.</Body>
          <Button variant="subtle" label="Back to workouts" onPress={back} />
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

  /** What the next edit builds on. */
  const latest = (): WorkoutBody => written.current ?? body;

  const commit = (next: WorkoutBody): void => {
    if (uid === null) return;
    // Pruned on every edit so a dissolved circuit cannot leave its round rest
    // behind for a later group that reuses the id. Not awaited.
    const pruned = pruneGroupRest(next);
    written.current = pruned;
    void saveWorkoutBody(uid, workout.id, pruned);
  };

  const mapSlots = (change: (slots: readonly ExerciseSlot[]) => ExerciseSlot[]): void => {
    const current = latest();
    commit({ ...current, slots: change(current.slots) });
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
  };

  const removeSlot = (slotId: string): void => {
    // Reconciled: deleting a member can leave a circuit of one, which is just
    // an exercise.
    mapSlots((slots) => reconcileGroups(slots.filter((slot) => slot.slotId !== slotId)));
  };

  const setSlotRest = (slotId: string, seconds: number): void => {
    mapSlots((slots) =>
      slots.map((slot) =>
        slot.slotId === slotId
          ? { ...slot, prescription: { ...slot.prescription, restSeconds: seconds } }
          : slot,
      ),
    );
  };

  const duplicate = (slotId: string): void => {
    mapSlots((slots) => duplicateSlot(slots, slotId, newId()));
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
    setNotice(`Published v${String(result.versionNumber)} — ${result.changeSummary}`);
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
          // Two rows already in one circuit have nothing to join, and a rest
          // row joins none, so hovering there stays a move.
          canGroup={(slotId, targetId) => {
            const isRest = (id: string): boolean =>
              workout.slots.find((slot) => slot.slotId === id)?.kind === 'rest';
            if (isRest(slotId) || isRest(targetId)) return false;
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
          <View style={styles.titleRow}>
            <BackArrow fallback="/workouts" label="Back to workouts" />
            <NameField
              name={workout.name}
              onSave={(next) => {
                const current = latest();
                if (next !== current.name) commit({ ...current, name: next });
              }}
            />
          </View>

          <Row>
            {/* Exercises, not rows: a rest row is a pause, not an exercise. */}
            <Badge
              label={exerciseCount === 1 ? '1 exercise' : `${String(exerciseCount)} exercises`}
            />
            <Badge label={`${String(totalSets(body))} sets`} />
            {workout.slots.length === 0 ? null : (
              <Badge
                label={`~${formatEstimate(estimateWorkoutSeconds(body, profile.defaultRestSeconds))}`}
              />
            )}
            <Badge
              tone={workout.currentVersion === 0 ? 'gray' : 'accent'}
              label={
                workout.currentVersion === 0 ? 'unpublished' : `v${String(workout.currentVersion)}`
              }
            />
            {/* Every edit lands in the local cache at once, so "saved here"
                and "saved everywhere" would look the same without this. */}
            <Badge label={hasPendingWrites ? 'saving…' : 'saved'} />
            {archived ? <Badge tone="orange" label="archived" /> : null}
          </Row>

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
            <Notice title="Unpublished changes">
              <View style={styles.changes}>
                <Text style={[styles.body, { color: palette.text }]}>{pendingDiff.summary}</Text>
                <Row gap={8}>
                  <Button
                    size="compact"
                    label={`Publish v${String(workout.currentVersion + 1)}`}
                    onPress={publish}
                  />
                  {published === null ? null : (
                    <Button
                      size="compact"
                      variant="subtle"
                      label={`Discard, back to v${String(published.versionNumber)}`}
                      onPress={discard}
                    />
                  )}
                </Row>
              </View>
            </Notice>
          ) : null}

          {workout.slots.length === 0 ? <Body dimmed>No exercises yet.</Body> : null}

          {/* Rendered even when empty: its top insert row adds the first exercise. */}
          <SlotList
            slots={workout.slots}
            groupRest={workout.groupRest}
            defaultRestSeconds={profile.defaultRestSeconds}
            onEditSlot={setEditingSlot}
            onMove={(from, to) => {
              // Reconciled after the move, which is what lets ↑ and ↓ carry a
              // member out of a circuit, as on the web.
              mapSlots((slots) => reconcileGroups(reorder(slots, from, to)));
            }}
            onRestSeconds={setSlotRest}
            onAdd={setPicking}
            onAddRest={(place) => {
              mapSlots((slots) => placeSlot(slots, createRestSlot(newId()), place));
            }}
            onRemoveSlot={removeSlot}
            onDuplicateSlot={duplicate}
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
              const current = latest();
              commit({ ...current, groupRest: { ...current.groupRest, [groupId]: seconds } });
            }}
          />

          {/* One hint, and each half only once it applies, as on the web. */}
          {workout.slots.length === 0 ? null : (
            <Text style={[styles.small, { color: palette.dimmed }]}>
              Swipe a row left to delete it.
              {exerciseCount > 1
                ? ' Hold a row to drag it. Drag an exercise onto another and hold for a moment to make them a circuit.'
                : ''}
              {hasCircuit
                ? ' To leave a circuit, drag a member out of the block in any direction — or swipe the row right.'
                : ''}
            </Text>
          )}

          <Section
            title="Muscle map"
            open={fold === 'muscles'}
            onToggle={() => {
              setFold((current) => (current === 'muscles' ? null : 'muscles'));
            }}
          >
            {/* Session bands, not weekly: one workout is one session's work. */}
            <MuscleMap
              volume={workoutVolume(body, lookup)}
              stops={SESSION_STOPS}
              scopeLabel="this workout"
              basis="planned"
            />
          </Section>

          <Section
            title="Notes"
            open={fold === 'notes'}
            onToggle={() => {
              setFold((current) => (current === 'notes' ? null : 'notes'));
            }}
          >
            <NotesField
              notes={workout.notes}
              onSave={(next) => {
                if (uid !== null) void saveWorkoutNotes(uid, workout.id, next);
              }}
            />
          </Section>

          <Section
            title="Version history"
            open={fold === 'versions'}
            onToggle={() => {
              setFold((current) => (current === 'versions' ? null : 'versions'));
            }}
          >
            <VersionHistory versions={versions} currentVersion={workout.currentVersion} />
          </Section>

          <Section
            title="Share"
            open={fold === 'share'}
            onToggle={() => {
              setFold((current) => (current === 'share' ? null : 'share'));
            }}
          >
            {/* The published version, not the working copy: a link carries a
                snapshot that cannot move under the recipient. */}
            <SharePanel workout={workout} version={published} />
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
              <Row gap={8}>
                <Button size="compact" variant="danger" label="Delete for good" onPress={remove} />
                <Button
                  size="compact"
                  variant="subtle"
                  label="Keep it"
                  onPress={() => {
                    setArmedToDelete(false);
                  }}
                />
              </Row>
            ) : (
              <Button
                size="compact"
                variant="danger-subtle"
                label="Delete workout"
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
        onDuplicate={duplicate}
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

/** The name, as typed and trimmed. Blank saves nothing. */
function NameField({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const palette = usePalette();
  const draft = useDraft(name, (text) => {
    const trimmed = text.trim();
    if (trimmed !== '') onSave(trimmed);
  });
  return (
    <TextInput
      accessibilityLabel="Workout name"
      {...draft}
      returnKeyType="done"
      style={[styles.name, { color: palette.text }]}
    />
  );
}

/** Saves when typing ends, or when its fold closes or the screen goes first. */
function NotesField({ notes, onSave }: { notes: string; onSave: (notes: string) => void }) {
  const draft = useDraft(notes, (text) => {
    if (text !== notes) onSave(text);
  });
  return <Field label="Workout notes" multiline {...draft} style={styles.notes} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // The web's name field: size lg, weight 650.
  name: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '700', paddingVertical: 2 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  notice: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  changes: { gap: 8 },
  danger: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8, alignItems: 'flex-start' },
  notes: { minHeight: 96, paddingTop: 10, textAlignVertical: 'top' },
});
