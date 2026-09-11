import { notifications } from '@mantine/notifications';
import { useDeferredValue, useMemo, useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import {
  deleteCustomExercise,
  newCustomExerciseId,
  saveCustomExercise,
} from '@/data/mutations/exercises';
import type { CustomExercise, Equipment, Exercise } from '@/domain/exercises';
import { search } from '@/domain/search';
import { useRecentSearches } from '@/features/workouts/useRecentSearches';
import type { CustomExerciseDraft } from './CustomExerciseForm';
import { CustomExerciseForm } from './CustomExerciseForm';
import { musclesInRegion } from './bodyRegions';
import { ExerciseBrowser } from './ExerciseBrowser';
import { ExerciseDetailDrawer } from './ExerciseDetailDrawer';
import classes from './ExercisesScreen.module.css';

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

/**
 * The exercise library: the same browser as the workout picker, plus
 * creating, editing and deleting a custom exercise.
 */
export default function ExercisesScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver, index, isPending, error } = useExerciseLibrary();

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [editing, setEditing] = useState<CustomExercise | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { recent, remember } = useRecentSearches();

  // Typing stays responsive while the (cheap but not free) filter runs against
  // the previous query — §3 calls for exactly this.
  const deferredQuery = useDeferredValue(query);
  const stale = deferredQuery !== query;

  const muscles = useMemo(() => musclesInRegion(region), [region]);

  const results = useMemo(
    () => search(index, deferredQuery, { muscles, musclesPrimaryOnly: true, equipment }),
    [index, deferredQuery, muscles, equipment],
  );

  const existingNames = useMemo(
    () =>
      resolver
        .all()
        .filter((item) => item.isCustom)
        .map((item) => item.name),
    [resolver],
  );

  const preview = (exercise: Exercise): void => {
    remember(query);
    setSelected(exercise);
  };

  const saveDraft = (draft: CustomExerciseDraft): void => {
    if (uid === null) return;
    const id = editing?.id ?? newCustomExerciseId();
    // Not awaited: applied to the local cache immediately, flushed on reconnect.
    void saveCustomExercise(uid, id, draft);
    setFormOpen(false);
    setEditing(null);
    setSelected(null);
    notifications.show({
      message: editing === null ? `Added ${draft.name}` : `Saved ${draft.name}`,
      color: 'sky',
    });
  };

  const removeExercise = (exercise: Exercise): void => {
    if (uid === null || !exercise.isCustom) return;
    void deleteCustomExercise(uid, exercise.id);
    setSelected(null);
    notifications.show({ message: `Deleted ${exercise.name}`, color: 'gray' });
  };

  return (
    <div className={classes.screen}>
      <ExerciseBrowser
        title="Exercises"
        onNew={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        query={query}
        onQueryChange={setQuery}
        searchLabel="Search exercises"
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

      <ExerciseDetailDrawer
        exercise={selected}
        onClose={() => {
          setSelected(null);
        }}
        onEdit={(exercise) => {
          setEditing(asCustomExercise(exercise));
          setFormOpen(true);
        }}
        onDelete={removeExercise}
      />

      {formOpen ? (
        <CustomExerciseForm
          opened
          editing={editing ?? undefined}
          existingNames={existingNames}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={saveDraft}
        />
      ) : null}
    </div>
  );
}
