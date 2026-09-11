import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDeferredValue, useMemo, useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { newCustomExerciseId, saveCustomExercise } from '@/data/mutations/exercises';
import type { Equipment, Exercise } from '@/domain/exercises';
import { fromCustom } from '@/domain/exercises';
import { search } from '@/domain/search';
import type { CustomExerciseDraft } from '@/features/exercises/CustomExerciseForm';
import { CustomExerciseForm } from '@/features/exercises/CustomExerciseForm';
import { ExerciseBrowser } from '@/features/exercises/ExerciseBrowser';
import { ExerciseDetailDrawer } from '@/features/exercises/ExerciseDetailDrawer';
import { Panel } from '@/features/exercises/Panel';
import { musclesInRegion } from '@/features/exercises/bodyRegions';
import { useRecentSearches } from './useRecentSearches';

type Props = {
  opened: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
};

/**
 * Exercise search for adding a slot to a workout.
 *
 * Tapping a result opens a preview rather than adding it: the catalog has ten
 * near-identical lateral raises, and the name alone does not say which is
 * which. The preview shows both movement frames and the instructions, then
 * adds only on confirmation — so a mis-tap costs nothing.
 *
 * A custom exercise can be created from here as well as from the Exercises
 * screen. This is where you find out the catalog is missing your lift, and
 * leaving for another screen loses the workout you were building.
 */
export function ExercisePicker({ opened, onClose, onPick }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver, index, isPending, error } = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [previewing, setPreviewing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const { recent, remember } = useRecentSearches();
  const deferredQuery = useDeferredValue(query);
  const stale = deferredQuery !== query;

  const muscles = useMemo(() => musclesInRegion(region), [region]);

  const results = useMemo(
    () =>
      search(index, deferredQuery, { limit: 300, muscles, musclesPrimaryOnly: true, equipment }),
    [index, deferredQuery, muscles, equipment],
  );

  const existingNames = useMemo(
    () =>
      resolver
        .all()
        .filter((exercise) => exercise.isCustom)
        .map((exercise) => exercise.name),
    [resolver],
  );

  /**
   * Back to a clean search. Every way out of the picker goes through this.
   *
   * The component stays mounted between visits — the parent only flips
   * `opened` — so anything left here is still on screen next time. A stale
   * query is the wrong starting point: the picker reopens from a different
   * row, usually for a different lift.
   */
  const reset = (): void => {
    setPreviewing(null);
    setCreating(false);
    setQuery('');
    setRegion(null);
    setEquipment([]);
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const closePreview = (): void => {
    setPreviewing(null);
  };

  const preview = (exercise: Exercise): void => {
    remember(query);
    setPreviewing(exercise);
  };

  /**
   * Adds one exercise. Both call sites close the picker on a pick, so this is
   * the end of the visit and the search is cleared with it — `onClose` does
   * not run on this path.
   */
  const add = (exercise: Exercise): void => {
    reset();
    onPick(exercise);
  };

  const saveNew = (draft: CustomExerciseDraft): void => {
    if (uid === null) return;
    const id = newCustomExerciseId();
    // Not awaited: applied to the local cache immediately, flushed on reconnect.
    void saveCustomExercise(uid, id, draft);
    setCreating(false);
    // Straight into the workout. Creating one here is only ever a step towards
    // adding it, and the preview has nothing to show for a lift with no
    // catalog frames.
    add(fromCustom({ ...draft, id, isCustom: true, createdAt: null }));
    notifications.show({ message: `Added ${draft.name}`, color: 'sky' });
  };

  return (
    <>
      <Panel opened={opened} onClose={close} label="Add exercise" fill>
        <ExerciseBrowser
          title="Add exercise"
          onClose={close}
          onNew={() => {
            setCreating(true);
          }}
          query={query}
          onQueryChange={setQuery}
          searchLabel="Search exercises to add"
          autoFocus
          recent={recent}
          region={region}
          onRegionChange={setRegion}
          equipment={equipment}
          onEquipmentChange={setEquipment}
          exercises={results}
          onSelect={preview}
          stale={stale}
          pending={isPending}
          error={error}
        />
      </Panel>

      <ExerciseDetailDrawer
        exercise={previewing}
        onClose={closePreview}
        // Above the search panel, which stays mounted behind it so the query
        // and scroll position survive a cancel.
        zIndex={400}
        actions={
          <>
            <Button variant="default" onClick={closePreview}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (previewing === null) return;
                add(previewing);
              }}
            >
              Add to workout
            </Button>
          </>
        }
      />

      {creating ? (
        <CustomExerciseForm
          opened
          existingNames={existingNames}
          onClose={() => {
            setCreating(false);
          }}
          onSave={saveNew}
          // Above the search panel, like the preview.
          zIndex={400}
        />
      ) : null}
    </>
  );
}
