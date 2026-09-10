import { Button, Group, Modal, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDeferredValue, useMemo, useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { newCustomExerciseId, saveCustomExercise } from '@/data/mutations/exercises';
import type { Exercise } from '@/domain/exercises';
import { fromCustom } from '@/domain/exercises';
import { MUSCLE_GROUPS_BY_REGION } from '@/domain/muscles';
import { search } from '@/domain/search';
import type { CustomExerciseDraft } from '@/features/exercises/CustomExerciseForm';
import { CustomExerciseForm } from '@/features/exercises/CustomExerciseForm';
import { ExerciseDetail } from '@/features/exercises/ExerciseDetail';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { useRecentSearches } from './useRecentSearches';
import classes from './ExercisePicker.module.css';

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
 * The body-part rail filters by display region, not by single muscle. "Back"
 * is how someone picking an exercise thinks; "lats, middle back, lower back,
 * traps" is how the data is stored, and making a person choose between those
 * four to see any of them is a worse question than the one they asked.
 *
 * A custom exercise can be created from here as well as from the Exercises
 * screen. This is where you find out the catalog is missing your lift, and
 * leaving for another screen loses the workout you were building.
 */
export function ExercisePicker({ opened, onClose, onPick }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver, index, isPending } = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const { recent, remember } = useRecentSearches();
  const deferredQuery = useDeferredValue(query);

  // Empty means "every region", which is what `search` already does with an
  // empty muscle filter.
  const muscles = useMemo(
    () => MUSCLE_GROUPS_BY_REGION.find((entry) => entry.region === region)?.muscles ?? [],
    [region],
  );

  const results = useMemo(
    () => search(index, deferredQuery, { limit: 300, muscles, musclesPrimaryOnly: true }),
    [index, deferredQuery, muscles],
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
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const closePreview = (): void => {
    setPreviewing(null);
  };

  /**
   * Adds one exercise. Both call sites close the picker on a pick, so this is
   * the end of the visit and the search is cleared with it — `onClose` does
   * not run on this path.
   */
  const add = (exercise: Exercise): void => {
    remember(query);
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
      <Modal.Root
        opened={opened}
        onClose={close}
        fullScreen
        classNames={{ content: classes.pane, header: classes.paneHeader, body: classes.paneBody }}
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>Add exercise</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>
            <Stack className={classes.searchStack}>
              <TextInput
                placeholder="Search exercises"
                aria-label="Search exercises to add"
                data-autofocus
                value={query}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                }}
              />

              {query === '' && recent.length > 0 ? (
                <Group gap={6} role="group" aria-label="Recent searches">
                  <Text size="xs" c="dimmed">
                    Recent
                  </Text>
                  {recent.map((entry) => (
                    <Button
                      key={entry}
                      size="compact-xs"
                      variant="light"
                      onClick={() => {
                        setQuery(entry);
                      }}
                    >
                      {entry}
                    </Button>
                  ))}
                </Group>
              ) : null}

              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="xs" c="dimmed">
                  Tap one to see the movement before adding it.
                </Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() => {
                    setCreating(true);
                  }}
                >
                  New exercise
                </Button>
              </Group>

              {isPending ? (
                <Skeleton height={320} radius="md" />
              ) : (
                <div className={classes.body}>
                  <div className={classes.rail} role="group" aria-label="Filter by body part">
                    <RegionButton
                      label="All"
                      active={region === null}
                      onClick={() => {
                        setRegion(null);
                      }}
                    />
                    {MUSCLE_GROUPS_BY_REGION.map((entry) => (
                      <RegionButton
                        key={entry.region}
                        label={entry.region}
                        active={region === entry.region}
                        onClick={() => {
                          // Tapping the active region clears it, so the rail needs
                          // no "off" control of its own beyond All.
                          setRegion(region === entry.region ? null : entry.region);
                        }}
                      />
                    ))}
                  </div>
                  <div className={classes.results}>
                    <ExerciseList exercises={results} onSelect={setPreviewing} withChevron fill />
                  </div>
                </div>
              )}
            </Stack>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      <Modal.Root
        opened={previewing !== null}
        onClose={closePreview}
        fullScreen
        // Sits above the search modal, which stays mounted behind it so the
        // query and scroll position survive a cancel.
        zIndex={400}
        classNames={{ content: classes.pane, header: classes.paneHeader, body: classes.paneBody }}
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Modal.Title>{previewing?.name ?? ''}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>
            {previewing === null ? null : <ExerciseDetail exercise={previewing} />}
          </Modal.Body>
          <Group justify="flex-end" className={classes.actions}>
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
          </Group>
        </Modal.Content>
      </Modal.Root>

      {creating ? (
        <CustomExerciseForm
          opened
          existingNames={existingNames}
          onClose={() => {
            setCreating(false);
          }}
          onSave={saveNew}
          // Above the search modal, like the preview.
          zIndex={400}
        />
      ) : null}
    </>
  );
}

/** One section of the rail. A plain button, so the block reads as one control. */
function RegionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={classes.railStep} aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );
}
