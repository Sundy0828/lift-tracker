import { useAuth } from '@lift/data/hooks/useAuth';
import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import {
  deleteCustomExercise,
  newCustomExerciseId,
  saveCustomExercise,
} from '@lift/data/mutations/exercises';
import type { CustomExercise, Exercise } from '@lift/domain/exercises';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinkButton, Sheet } from '../../components/editor/controls';
import {
  CustomExerciseForm,
  type CustomExerciseDraft,
} from '../../components/editor/CustomExerciseForm';
import { ExerciseDetail } from '../../components/editor/ExerciseDetail';
import { ExerciseSearch, useExerciseSearch } from '../../components/exercises/ExerciseSearch';
import { SyncStrip } from '../../components/SyncStrip';
import { BackTitle, Button, Notice } from '../../components/ui';
import { usePalette } from '../../theme';

/** Only custom exercises can be edited, so the form needs the full record. */
function asCustomExercise(exercise: Exercise): CustomExercise {
  return {
    id: exercise.id,
    name: exercise.name,
    primaryMuscles: [...exercise.primaryMuscles],
    secondaryMuscles: [...exercise.secondaryMuscles],
    equipment: exercise.equipment,
    isCustom: true,
    createdAt: null,
  };
}

/** What the sheet over the list is showing, if anything. */
type Open =
  { kind: 'detail'; exercise: Exercise } | { kind: 'form'; editing: CustomExercise | null } | null;

/** How long a notice stays up. */
const NOTICE_MS = 4000;

/**
 * The exercise library: the same search as the workout picker, plus creating,
 * editing and deleting a custom exercise. The web's `ExercisesScreen`.
 */
export default function Exercises() {
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver } = useExerciseLibrary();
  const searchState = useExerciseSearch();
  const [open, setOpen] = useState<Open>(null);
  const [armedToDelete, setArmedToDelete] = useState(false);
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

  const existingNames = useMemo(
    () =>
      resolver
        .all()
        .filter((item) => item.isCustom)
        .map((item) => item.name),
    [resolver],
  );

  const close = (): void => {
    setOpen(null);
    setArmedToDelete(false);
  };

  const saveDraft = (editing: CustomExercise | null, draft: CustomExerciseDraft): void => {
    if (uid === null) return;
    // Not awaited: applied to the local cache immediately, flushed on reconnect.
    void saveCustomExercise(uid, editing?.id ?? newCustomExerciseId(), draft);
    close();
    setNotice(editing === null ? `Added ${draft.name}` : `Saved ${draft.name}`);
  };

  const remove = (exercise: Exercise): void => {
    if (uid === null || !exercise.isCustom) return;
    void deleteCustomExercise(uid, exercise.id);
    close();
    setNotice(`Deleted ${exercise.name}`);
  };

  const sheetTitle =
    open === null
      ? ''
      : open.kind === 'detail'
        ? open.exercise.name
        : open.editing === null
          ? 'New exercise'
          : `Edit ${open.editing.name}`;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: palette.background }]}>
      <SyncStrip />
      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.grow}>
            <BackTitle title="Exercises" fallback="/settings" />
          </View>
          <Button
            size="compact"
            label="New"
            onPress={() => {
              setOpen({ kind: 'form', editing: null });
            }}
          />
        </View>

        {notice === null ? null : (
          <Notice
            tone="accent"
            onClose={() => {
              setNotice(null);
            }}
          >
            {notice}
          </Notice>
        )}

        {/* A list of its own, so not inside a ScrollView. */}
        <ExerciseSearch
          state={searchState}
          label="Search exercises"
          onSelect={(exercise) => {
            setOpen({ kind: 'detail', exercise });
          }}
          onCreate={() => {
            setOpen({ kind: 'form', editing: null });
          }}
        />
      </View>

      {/* One sheet for the detail and the form, so editing from the detail
          swaps its content rather than stacking a second modal (iOS shows one
          at a time). */}
      <Sheet
        visible={open !== null}
        title={sheetTitle}
        onClose={close}
        footer={
          open?.kind === 'detail' && open.exercise.isCustom ? (
            armedToDelete ? (
              <>
                <View style={styles.grow}>
                  <Button
                    variant="danger"
                    label="Delete for good"
                    onPress={() => {
                      remove(open.exercise);
                    }}
                  />
                </View>
                <View style={styles.grow}>
                  <Button
                    variant="subtle"
                    label="Keep it"
                    onPress={() => {
                      setArmedToDelete(false);
                    }}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.grow}>
                  <Button
                    variant="danger-subtle"
                    label="Delete"
                    onPress={() => {
                      setArmedToDelete(true);
                    }}
                  />
                </View>
                <View style={styles.grow}>
                  <Button
                    label="Edit"
                    onPress={() => {
                      setOpen({ kind: 'form', editing: asCustomExercise(open.exercise) });
                    }}
                  />
                </View>
              </>
            )
          ) : undefined
        }
        headerAction={
          open?.kind === 'form' && open.editing !== null ? (
            <LinkButton label="Cancel" onPress={close} />
          ) : undefined
        }
      >
        {open === null ? null : open.kind === 'detail' ? (
          <ExerciseDetail exercise={open.exercise} />
        ) : (
          <CustomExerciseForm
            // Remounted per exercise, so the form starts from that one's values.
            key={open.editing?.id ?? 'new'}
            initialName={open.editing === null ? searchState.query.trim() : ''}
            existingNames={existingNames}
            {...(open.editing === null ? {} : { editing: open.editing })}
            onCancel={close}
            onSave={(draft) => {
              saveDraft(open.editing, draft);
            }}
          />
        )}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
});
