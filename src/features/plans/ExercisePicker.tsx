import { Modal, Skeleton, Stack, TextInput } from '@mantine/core';
import { useDeferredValue, useMemo, useState } from 'react';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import type { Exercise } from '@/domain/exercises';
import { search } from '@/domain/search';
import { ExerciseList } from '@/features/exercises/ExerciseList';

type Props = {
  opened: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
};

/**
 * Exercise search in a modal, for adding a slot to a workout. Reuses the
 * virtualised list from the exercises feature so both places behave the same.
 */
export function ExercisePicker({ opened, onClose, onPick }: Props) {
  const { index, isPending } = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(
    () => search(index, deferredQuery, { limit: 300 }),
    [index, deferredQuery],
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Add exercise" fullScreen>
      <Stack>
        <TextInput
          placeholder="Search exercises"
          aria-label="Search exercises to add"
          data-autofocus
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
        {isPending ? (
          <Skeleton height={320} radius="md" />
        ) : (
          <ExerciseList
            exercises={results}
            onSelect={(exercise) => {
              onPick(exercise);
              setQuery('');
            }}
          />
        )}
      </Stack>
    </Modal>
  );
}
