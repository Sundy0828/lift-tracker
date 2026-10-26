import { useAuth } from '@lift/data/hooks/useAuth';
import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { newCustomExerciseId, saveCustomExercise } from '@lift/data/mutations/exercises';
import type { Exercise } from '@lift/domain/exercises';
import { fromCustom } from '@lift/domain/exercises';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ExerciseSearch, useExerciseSearch } from '../exercises/ExerciseSearch';
import { Button } from '../ui';
import { LinkButton, Sheet } from './controls';
import { CustomExerciseForm, type CustomExerciseDraft } from './CustomExerciseForm';
import { ExerciseDetail } from './ExerciseDetail';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  /** The preview's confirm button. "Add to workout" in the editor. */
  actionLabel?: string;
  /** The search view's title. */
  title?: string;
};

/** Search, then a preview of one result, or the form for a new exercise. One sheet, three views. */
type View_ = { kind: 'search' } | { kind: 'preview'; exercise: Exercise } | { kind: 'create' };

/**
 * Exercise search for adding a slot, as on the web (`ExercisePicker`).
 *
 * Tapping a result previews it rather than adding it: the catalog has ten
 * near-identical lateral raises, and the name alone does not say which is
 * which. A custom exercise can be made from here too, since this is where you
 * find out the catalog is missing your lift.
 *
 * The three views share one modal. iOS shows one modal at a time, so a
 * preview stacked on the search sheet would never appear.
 */
export function ExercisePicker({
  visible,
  onClose,
  onPick,
  actionLabel = 'Add to workout',
  title = 'Add exercise',
}: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver } = useExerciseLibrary();
  const searchState = useExerciseSearch();
  const [view, setView] = useState<View_>({ kind: 'search' });

  const existingNames = useMemo(
    () =>
      resolver
        .all()
        .filter((exercise) => exercise.isCustom)
        .map((exercise) => exercise.name),
    [resolver],
  );

  /**
   * Back to a clean search. Every way out goes through this: the sheet stays
   * mounted between visits, and it reopens from a different row, usually for
   * a different lift.
   */
  const reset = (): void => {
    setView({ kind: 'search' });
    searchState.reset();
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const add = (exercise: Exercise): void => {
    reset();
    onPick(exercise);
  };

  const saveNew = (draft: CustomExerciseDraft): void => {
    if (uid === null) return;
    const id = newCustomExerciseId();
    // Not awaited: applied to the local cache immediately, flushed on reconnect.
    void saveCustomExercise(uid, id, draft);
    // Straight in: making one here is only ever a step towards adding it.
    add(fromCustom({ ...draft, id, isCustom: true, createdAt: null }));
  };

  const backToSearch = (): void => {
    setView({ kind: 'search' });
  };

  // One Sheet for all three views, so switching view swaps its content
  // rather than dismissing one modal and presenting another.
  return (
    <Sheet
      visible={visible}
      title={
        view.kind === 'preview'
          ? view.exercise.name
          : view.kind === 'create'
            ? 'New exercise'
            : title
      }
      onClose={view.kind === 'search' ? close : backToSearch}
      scroll={view.kind !== 'search'}
      headerAction={
        view.kind === 'search' ? (
          <LinkButton
            label="New"
            tone="accent"
            onPress={() => {
              setView({ kind: 'create' });
            }}
          />
        ) : undefined
      }
      footer={
        view.kind === 'preview' ? (
          <>
            <View style={styles.grow}>
              <Button variant="subtle" label="Back" onPress={backToSearch} />
            </View>
            <View style={styles.grow}>
              <Button
                label={actionLabel}
                onPress={() => {
                  add(view.exercise);
                }}
              />
            </View>
          </>
        ) : undefined
      }
    >
      {view.kind === 'preview' ? (
        <ExerciseDetail exercise={view.exercise} />
      ) : view.kind === 'create' ? (
        <CustomExerciseForm
          initialName={searchState.query.trim()}
          existingNames={existingNames}
          onCancel={backToSearch}
          onSave={saveNew}
        />
      ) : (
        <ExerciseSearch
          state={searchState}
          label="Search exercises to add"
          autoFocus
          onSelect={(exercise) => {
            setView({ kind: 'preview', exercise });
          }}
          onCreate={() => {
            setView({ kind: 'create' });
          }}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
