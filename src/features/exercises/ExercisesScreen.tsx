import {
  Alert,
  Button,
  Group,
  MultiSelect,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
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
import { EQUIPMENT, isEquipment } from '@/domain/exercises';
import type { MuscleGroup } from '@/domain/muscles';
import { MUSCLE_OPTIONS_BY_REGION, isMuscleGroup } from '@/domain/muscles';
import { search } from '@/domain/search';
import type { CustomExerciseDraft } from './CustomExerciseForm';
import { CustomExerciseForm } from './CustomExerciseForm';
import { ExerciseDetailDrawer } from './ExerciseDetailDrawer';
import { ExerciseList } from './ExerciseList';

const MUSCLE_OPTIONS = MUSCLE_OPTIONS_BY_REGION;

const EQUIPMENT_OPTIONS = EQUIPMENT.map((item) => ({ value: item, label: item }));

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

export default function ExercisesScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver, index, isPending, error } = useExerciseLibrary();

  const [query, setQuery] = useState('');
  const [muscles, setMuscles] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [editing, setEditing] = useState<CustomExercise | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Typing stays responsive while the (cheap but not free) filter runs against
  // the previous query — §3 calls for exactly this.
  const deferredQuery = useDeferredValue(query);
  const stale = deferredQuery !== query;

  const results = useMemo(
    () => search(index, deferredQuery, { muscles, equipment }),
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
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Exercises</Title>
        <Button
          size="compact-md"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          New
        </Button>
      </Group>

      {error === null ? null : (
        <Alert color="red" variant="light" role="alert">
          {error}
        </Alert>
      )}

      <TextInput
        placeholder="Search 876 exercises"
        value={query}
        aria-label="Search exercises"
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
      />

      <Group grow align="flex-start">
        <MultiSelect
          label="Muscle"
          placeholder={muscles.length === 0 ? 'Any' : undefined}
          searchable
          clearable
          data={MUSCLE_OPTIONS}
          value={muscles}
          onChange={(values) => {
            setMuscles(values.filter(isMuscleGroup));
          }}
        />
        <MultiSelect
          label="Equipment"
          placeholder={equipment.length === 0 ? 'Any' : undefined}
          clearable
          data={EQUIPMENT_OPTIONS}
          value={equipment}
          onChange={(values) => {
            setEquipment(values.filter(isEquipment));
          }}
        />
      </Group>

      {isPending ? (
        <Skeleton height={320} radius="md" />
      ) : (
        <>
          <Text size="xs" c={stale ? 'dimmed' : 'bright'} data-testid="result-count">
            {results.length === 1 ? '1 exercise' : `${String(results.length)} exercises`}
          </Text>
          <ExerciseList exercises={results} onSelect={setSelected} withChevron />
        </>
      )}

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
    </Stack>
  );
}
