import { useAuth } from '@lift/data/hooks/useAuth';
import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { useWorkout } from '@lift/data/hooks/useWorkout';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { newCustomExerciseId } from '@lift/data/mutations/exercises';
import { importSharedWorkout, mergeSharedWorkout } from '@lift/data/mutations/sharing';
import { newId } from '@lift/data/mutations/workouts';
import type { SharedWorkout } from '@lift/domain/sharing';
import {
  applyMerge,
  changeKey,
  describeNewExercises,
  planImport,
  previewMerge,
} from '@lift/domain/sharing';
import { describeChange } from '@lift/domain/workoutDiff';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { Chip } from '../editor/controls';
import { Badge, Body, Button, Card, Heading, Notice, Segmented, Small } from '../ui';
import { describeShareError } from './shareError';

type Mode = 'new' | 'merge';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Taking a shared workout into your own account, the two ways: the web's
 * `ImportPanel`, through the same shared importer.
 *
 * Importing mints a fresh workout and so a clean history; merging publishes a
 * new version of one of yours and keeps its history. That cannot be undone by
 * editing afterwards, so the choice is made before anything is written. Custom
 * exercises you do not already own are created, deduped by name, and named
 * up front.
 */
export function ImportPanel({ shared }: { shared: SharedWorkout }) {
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver, isPending: libraryPending } = useExerciseLibrary();
  const { workouts } = useWorkouts();

  const [mode, setMode] = useState<Mode>('new');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = workouts.filter((workout) => workout.archivedAt === null);
  const { workout: target, versions } = useWorkout(mode === 'merge' ? targetId : null);

  // Keyed off the library, so a reused exercise is spotted once it has loaded
  // rather than created a second time.
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
    setError(null);
    const workoutId = newId();
    try {
      const { promise } = importSharedWorkout(uid, workoutId, plan);
      await promise;
      router.replace({ pathname: '/workout/[workoutId]', params: { workoutId } });
    } catch (cause: unknown) {
      setError(describeShareError(cause, 'Could not import that workout'));
      setBusy(false);
    }
  };

  const runMerge = async (): Promise<void> => {
    if (uid === null || target === null || preview === null) return;
    setBusy(true);
    setError(null);
    const merged = applyMerge(target, preview.aligned, selected);
    // The last published version, for the change summary, as publishing uses.
    const published = versions.find((entry) => entry.versionNumber === target.currentVersion);
    try {
      const { promise } = mergeSharedWorkout(uid, target, merged, published ?? null, plan);
      await promise;
      router.replace({ pathname: '/workout/[workoutId]', params: { workoutId: target.id } });
    } catch (cause: unknown) {
      setError(describeShareError(cause, 'Could not merge that workout'));
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>Add this to your workouts</Heading>

      <Segmented
        label="How"
        options={[
          { value: 'new', label: 'Import as new' },
          { value: 'merge', label: 'Merge into mine' },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setSelection(null);
        }}
      />

      {mode === 'new' ? (
        <Body dimmed>
          A separate workout of your own, starting with no history. Nothing you already have is
          touched.
        </Body>
      ) : (
        <View style={styles.gap}>
          <Body dimmed>
            Publishes a new version of the workout you pick, keeping its history — so last
            session&rsquo;s numbers still show up under every exercise you keep.
          </Body>
          {live.length === 0 ? (
            <Small>No workouts yet.</Small>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              accessibilityLabel="Merge into"
            >
              {live.map((workout) => (
                <Chip
                  key={workout.id}
                  label={workout.name === '' ? 'Untitled workout' : workout.name}
                  selected={workout.id === targetId}
                  onPress={() => {
                    setTargetId(workout.id);
                    setSelection(null);
                  }}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {plan.create.length === 0 ? null : (
        <Notice tone="accent">
          {`${
            plan.create.length === 1
              ? 'This adds one exercise to your library: '
              : `This adds ${String(plan.create.length)} exercises to your library: `
          }${describeNewExercises(plan).join(', ')}.`}
        </Notice>
      )}

      {plan.reused.length === 0 ? null : (
        <Small>
          Matched to exercises you already have, by name:{' '}
          {plan.reused.map((exercise) => exercise.name).join(', ')}.
        </Small>
      )}

      {mode === 'merge' && preview !== null ? (
        <View style={styles.gap}>
          <Heading>What would change</Heading>
          {preview.changes.length === 0 ? (
            <Body dimmed>Nothing — this workout already matches.</Body>
          ) : (
            preview.changes.map((change) => {
              const key = changeKey(change);
              const checked = selected.has(key);
              return (
                <Pressable
                  key={key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => {
                    toggle(key);
                  }}
                  style={styles.check}
                >
                  <View
                    style={[
                      styles.box,
                      { borderColor: checked ? palette.accent : palette.border },
                      checked && { backgroundColor: palette.accent },
                    ]}
                  >
                    {checked ? (
                      <Text style={[styles.tick, { color: palette.onAccent }]}>✓</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.change, { color: palette.text }]}>
                    {capitalize(describeChange(change))}
                  </Text>
                  {change.kind === 'exercise-removed' ? (
                    <Badge tone="danger" label="loses history" />
                  ) : null}
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}

      {error === null ? null : <Notice tone="danger">{error}</Notice>}

      {mode === 'new' ? (
        <Button
          testID="import-new"
          label="Import as a new workout"
          busy={busy}
          disabled={libraryPending}
          onPress={() => void runImport()}
        />
      ) : (
        <Button
          testID="import-merge"
          label={`Merge${selected.size === 0 ? '' : ` ${String(selected.size)} change${selected.size > 1 ? 's' : ''}`}`}
          busy={busy}
          disabled={libraryPending || target === null || selected.size === 0}
          onPress={() => void runMerge()}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  chips: { gap: 8, alignItems: 'center', paddingRight: 16 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { fontSize: 14, fontWeight: '800', lineHeight: 16 },
  change: { flex: 1, fontSize: 14 },
});
