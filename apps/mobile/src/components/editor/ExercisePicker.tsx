import { useAuth } from '@lift/data/hooks/useAuth';
import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { newCustomExerciseId, saveCustomExercise } from '@lift/data/mutations/exercises';
import type { Equipment, Exercise } from '@lift/domain/exercises';
import { EQUIPMENT, equipmentLabel, fromCustom } from '@lift/domain/exercises';
import { MUSCLE_GROUPS_BY_REGION, muscleLabel, musclesInRegion } from '@lift/domain/muscles';
import { search } from '@lift/domain/search';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRecentSearches } from '../../recentSearches';
import { usePalette } from '../../theme';
import { Button } from '../ui';
import { Chip, LinkButton, Sheet } from './controls';
import { CustomExerciseForm, type CustomExerciseDraft } from './CustomExerciseForm';
import { ExerciseDetail } from './ExerciseDetail';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
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
export function ExercisePicker({ visible, onClose, onPick }: Props) {
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver, index, isPending, error } = useExerciseLibrary();
  const { recent, remember } = useRecentSearches();

  const [view, setView] = useState<View_>({ kind: 'search' });
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const deferredQuery = useDeferredValue(query);

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
   * Back to a clean search. Every way out goes through this: the sheet stays
   * mounted between visits, and it reopens from a different row, usually for
   * a different lift.
   */
  const reset = (): void => {
    setView({ kind: 'search' });
    setQuery('');
    setRegion(null);
    setEquipment([]);
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
    // Straight into the workout: making one here is only ever a step towards
    // adding it.
    add(fromCustom({ ...draft, id, isCustom: true, createdAt: null }));
  };

  const toggleEquipment = (item: Equipment): void => {
    setEquipment((current) =>
      current.includes(item) ? current.filter((other) => other !== item) : [...current, item],
    );
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
            : 'Add exercise'
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
                label="Add to workout"
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
          initialName={query.trim()}
          existingNames={existingNames}
          onCancel={backToSearch}
          onSave={saveNew}
        />
      ) : (
        <>
          <TextInput
            accessibilityLabel="Search exercises to add"
            placeholder="Search exercises"
            placeholderTextColor={palette.dimmed}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            value={query}
            onChangeText={setQuery}
            style={[
              styles.search,
              {
                color: palette.text,
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          />

          {query === '' && recent.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Text style={[styles.small, styles.chipLead, { color: palette.dimmed }]}>Recent</Text>
              {recent.map((entry) => (
                <Chip
                  key={entry}
                  label={entry}
                  selected={false}
                  onPress={() => {
                    setQuery(entry);
                  }}
                />
              ))}
            </ScrollView>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            accessibilityLabel="Body part"
          >
            <Chip
              label="All"
              selected={region === null}
              onPress={() => {
                setRegion(null);
              }}
            />
            {MUSCLE_GROUPS_BY_REGION.map(({ region: name }) => (
              <Chip
                key={name}
                label={name}
                selected={region === name}
                onPress={() => {
                  setRegion(region === name ? null : name);
                }}
              />
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            accessibilityLabel="Equipment"
          >
            {EQUIPMENT.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={equipment.includes(item)}
                onPress={() => {
                  toggleEquipment(item);
                }}
              />
            ))}
          </ScrollView>

          {error === null ? null : (
            <Text style={[styles.small, { color: palette.danger }]}>{error}</Text>
          )}

          <Text style={[styles.small, { color: palette.dimmed }]}>
            {isPending
              ? 'Loading exercises…'
              : `${results.length === 1 ? '1 exercise' : `${String(results.length)} exercises`} · tap one to see the movement`}
          </Text>

          <FlatList
            data={results}
            keyExtractor={(exercise) => exercise.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={20}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              isPending ? (
                <View />
              ) : (
                <View style={styles.empty}>
                  <Text style={[styles.body, { color: palette.dimmed }]}>Nothing matches.</Text>
                  <LinkButton
                    label={query.trim() === '' ? 'Make a new exercise' : `Make “${query.trim()}”`}
                    tone="accent"
                    onPress={() => {
                      setView({ kind: 'create' });
                    }}
                  />
                </View>
              )
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  remember(query);
                  setView({ kind: 'preview', exercise: item });
                }}
                style={({ pressed }) => [
                  styles.result,
                  { borderBottomColor: palette.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.body, { color: palette.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.small, { color: palette.dimmed }]} numberOfLines={1}>
                  {item.isCustom ? 'Custom · ' : ''}
                  {item.primaryMuscles.map(muscleLabel).join(', ')}
                  {` · ${equipmentLabel(item.equipment)}`}
                </Text>
              </Pressable>
            )}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  chips: { gap: 8, alignItems: 'center', paddingRight: 16 },
  chipLead: { marginRight: 2 },
  list: { paddingBottom: 32 },
  result: { paddingVertical: 12, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.6 },
  empty: { paddingVertical: 24, gap: 12, alignItems: 'center' },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
});
