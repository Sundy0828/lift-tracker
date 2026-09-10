import { Alert, Badge, Button, Card, Checkbox, Group, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { useWorkout } from '@/data/hooks/useWorkout';
import { useWorkouts } from '@/data/hooks/useWorkouts';
import { importSharedWorkout, mergeSharedWorkout } from '@/data/mutations/sharing';
import { newCustomExerciseId } from '@/data/mutations/exercises';
import { newId } from '@/data/mutations/workouts';
import type { SharedWorkout } from '@/domain/sharing';
import {
  applyMerge,
  changeKey,
  describeNewExercises,
  planImport,
  previewMerge,
} from '@/domain/sharing';
import { describeChange } from '@/domain/workoutDiff';

type Mode = 'new' | 'merge';

/**
 * Taking a shared workout into your own account, the two ways (§2.9).
 *
 * The difference between them is not cosmetic and the copy says so: importing
 * mints a fresh workout id and therefore a clean overlay history, while
 * merging keeps the target's id so its history survives. Getting that wrong is
 * not recoverable by editing afterwards, which is why the choice is made
 * before anything is written rather than inferred.
 *
 * Whichever path, custom exercises the importer does not already own are
 * created under their account, deduped by name — and named up front, because
 * "import a workout" does not sound like it writes to your exercise library.
 */
export function ImportPanel({ shared }: { shared: SharedWorkout }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const navigate = useNavigate();
  const { resolver, isPending: libraryPending } = useExerciseLibrary();
  const { workouts } = useWorkouts();

  const [mode, setMode] = useState<Mode>('new');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const live = workouts.filter((workout) => workout.archivedAt === null);
  const { workout: target, versions } = useWorkout(mode === 'merge' ? targetId : null);

  // Keyed off the library so a reused exercise is spotted as soon as the
  // importer's own list has loaded, rather than being created a second time.
  const plan = useMemo(
    () => planImport(shared, resolver.all(), newCustomExerciseId),
    [shared, resolver],
  );

  const preview = useMemo(
    () => (target === null ? null : previewMerge(target, plan.body)),
    [target, plan.body],
  );

  const [selection, setSelection] = useState<Set<string> | null>(null);
  const selected = selection ?? new Set(preview?.defaultSelection ?? []);

  const toggle = (key: string): void => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelection(next);
  };

  const runImport = async (): Promise<void> => {
    if (uid === null) return;
    setBusy(true);
    const workoutId = newId();
    try {
      const { promise } = importSharedWorkout(uid, workoutId, plan);
      await promise;
      notifications.show({ message: `${shared.body.name} imported`, color: 'teal' });
      await navigate(`/workouts/${workoutId}`);
    } catch {
      notifications.show({ message: 'Could not import that workout', color: 'red' });
      setBusy(false);
    }
  };

  const runMerge = async (): Promise<void> => {
    if (uid === null || target === null || preview === null) return;
    setBusy(true);
    const merged = applyMerge(target, preview.aligned, selected);
    // The last published version, for the change summary — the same input
    // publishing uses, so a merge reads like any other version in the history.
    const published = versions.find((entry) => entry.versionNumber === target.currentVersion);
    try {
      const { promise } = mergeSharedWorkout(uid, target, merged, published ?? null, plan);
      await promise;
      notifications.show({ message: `Merged into ${target.name}`, color: 'teal' });
      await navigate(`/workouts/${target.id}`);
    } catch {
      notifications.show({ message: 'Could not merge that workout', color: 'red' });
      setBusy(false);
    }
  };

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text fw={600}>Add this to your workouts</Text>

        <Select
          label="How"
          data={[
            { value: 'new', label: 'Import as a new workout' },
            { value: 'merge', label: 'Merge into one of mine' },
          ]}
          value={mode}
          allowDeselect={false}
          onChange={(value) => {
            setMode(value === 'merge' ? 'merge' : 'new');
            setSelection(null);
          }}
        />

        {mode === 'new' ? (
          <Text size="sm" c="dimmed">
            A separate workout of your own, starting with no history. Nothing you already have is
            touched.
          </Text>
        ) : (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Publishes a new version of the workout you pick, keeping its history — so last
              session&rsquo;s numbers still show up under every exercise you keep.
            </Text>
            <Select
              label="Merge into"
              placeholder={live.length === 0 ? 'No workouts yet' : 'Pick a workout'}
              data={live.map((workout) => ({
                value: workout.id,
                label: workout.name === '' ? 'Untitled workout' : workout.name,
              }))}
              value={targetId}
              disabled={live.length === 0}
              onChange={(value) => {
                setTargetId(value);
                setSelection(null);
              }}
            />
          </Stack>
        )}

        {plan.create.length === 0 ? null : (
          <Alert variant="light" color="sky">
            <Text size="sm">
              {plan.create.length === 1
                ? 'This adds one exercise to your library: '
                : `This adds ${String(plan.create.length)} exercises to your library: `}
              {describeNewExercises(plan).join(', ')}.
            </Text>
          </Alert>
        )}

        {plan.reused.length === 0 ? null : (
          <Text size="xs" c="dimmed">
            Matched to exercises you already have, by name:{' '}
            {plan.reused.map((exercise) => exercise.name).join(', ')}.
          </Text>
        )}

        {mode === 'merge' && preview !== null ? (
          <Stack gap={6}>
            <Text size="sm" fw={600}>
              What would change
            </Text>
            {preview.changes.length === 0 ? (
              <Text size="sm" c="dimmed">
                Nothing — this workout already matches.
              </Text>
            ) : (
              preview.changes.map((change) => {
                const key = changeKey(change);
                return (
                  <Checkbox
                    key={key}
                    checked={selected.has(key)}
                    onChange={() => {
                      toggle(key);
                    }}
                    label={
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm">{capitalize(describeChange(change))}</Text>
                        {change.kind === 'exercise-removed' ? (
                          <Badge size="xs" variant="light" color="red">
                            loses history
                          </Badge>
                        ) : null}
                      </Group>
                    }
                  />
                );
              })
            )}
          </Stack>
        ) : null}

        <Group>
          {mode === 'new' ? (
            <Button
              loading={busy}
              disabled={libraryPending}
              onClick={() => {
                void runImport();
              }}
            >
              Import as a new workout
            </Button>
          ) : (
            <Button
              loading={busy}
              disabled={libraryPending || target === null || selected.size === 0}
              onClick={() => {
                void runMerge();
              }}
            >
              Merge {selected.size === 0 ? '' : `${String(selected.size)} change`}
              {selected.size > 1 ? 's' : ''}
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
