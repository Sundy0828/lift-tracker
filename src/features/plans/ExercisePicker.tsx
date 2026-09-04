import { Button, Group, Modal, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { useDeferredValue, useMemo, useState } from 'react';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import type { Exercise } from '@/domain/exercises';
import { search } from '@/domain/search';
import { ExerciseDetail } from '@/features/exercises/ExerciseDetail';
import { ExerciseList } from '@/features/exercises/ExerciseList';

type Props = {
  opened: boolean;
  workoutName: string;
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
 */
export function ExercisePicker({ opened, workoutName, onClose, onPick }: Props) {
  const { index, isPending } = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [previewing, setPreviewing] = useState<Exercise | null>(null);
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(
    () => search(index, deferredQuery, { limit: 300 }),
    [index, deferredQuery],
  );

  const close = (): void => {
    setPreviewing(null);
    onClose();
  };

  return (
    <>
      <Modal opened={opened} onClose={close} title={`Add to ${workoutName}`} fullScreen>
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
            <ExerciseList exercises={results} onSelect={setPreviewing} withChevron />
          )}
          <Text size="xs" c="dimmed">
            Tap one to see the movement before adding it.
          </Text>
        </Stack>
      </Modal>

      <Modal
        opened={previewing !== null}
        onClose={() => {
          setPreviewing(null);
        }}
        title={previewing?.name ?? ''}
        fullScreen
        // Sits above the search modal, which stays mounted behind it so the
        // query and scroll position survive a cancel.
        zIndex={400}
      >
        {previewing === null ? null : (
          <Stack>
            <ExerciseDetail exercise={previewing} />
            <Group justify="flex-end" mt="sm">
              <Button
                variant="default"
                onClick={() => {
                  setPreviewing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onPick(previewing);
                  setPreviewing(null);
                  setQuery('');
                }}
              >
                Add to {workoutName}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
