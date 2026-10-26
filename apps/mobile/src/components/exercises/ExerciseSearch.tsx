import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import type { Equipment, Exercise } from '@lift/domain/exercises';
import { EQUIPMENT, equipmentLabel } from '@lift/domain/exercises';
import { MUSCLE_GROUPS_BY_REGION, muscleLabel, musclesInRegion } from '@lift/domain/muscles';
import { search } from '@lift/domain/search';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRecentSearches } from '../../recentSearches';
import { usePalette } from '../../theme';
import { Chip, LinkButton } from '../editor/controls';
import { Badge } from '../ui';
import { ExerciseThumb } from './ExerciseThumb';

/**
 * The exercise library's search, laid out as the web's `ExerciseBrowser`: the
 * box, recent searches, the count with an equipment filter beside it, and the
 * body-part rail to the left of the results. The workout picker and the
 * Exercises screen both draw it, as the web's serves both.
 *
 * The state lives in `useExerciseSearch`, outside the list, so a caller that
 * swaps the list for a preview and back keeps the query.
 */

export type ExerciseSearchState = ReturnType<typeof useExerciseSearch>;

export function useExerciseSearch() {
  const { index, isPending, error } = useExerciseLibrary();
  const { recent, remember } = useRecentSearches();
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

  const toggleEquipment = useCallback((item: Equipment): void => {
    setEquipment((current) =>
      current.includes(item) ? current.filter((other) => other !== item) : [...current, item],
    );
  }, []);

  /** Back to a clean search, for a picker reopened from a different row. */
  const reset = useCallback((): void => {
    setQuery('');
    setRegion(null);
    setEquipment([]);
  }, []);

  return {
    query,
    setQuery,
    region,
    setRegion,
    equipment,
    toggleEquipment,
    results,
    recent,
    remember,
    reset,
    isPending,
    error,
  };
}

export function ExerciseSearch({
  state,
  label,
  onSelect,
  onCreate,
  autoFocus = false,
}: {
  state: ExerciseSearchState;
  /** Focus the box at once: the picker opens to type into. */
  autoFocus?: boolean;
  /** The search box's accessible name. */
  label: string;
  /** A result was tapped. The query is remembered as a recent search first. */
  onSelect: (exercise: Exercise) => void;
  /** Make a new custom exercise, offered when nothing matches. */
  onCreate: () => void;
}) {
  const palette = usePalette();
  const { query, setQuery, region, setRegion, equipment, toggleEquipment, results, recent } = state;
  /** The equipment list, folded under its button as the web's dropdown. */
  const [choosingEquipment, setChoosingEquipment] = useState(false);

  return (
    <>
      {state.error === null ? null : (
        <Text accessibilityRole="alert" style={[styles.small, { color: palette.danger }]}>
          {state.error}
        </Text>
      )}

      <View
        style={[styles.search, { borderColor: palette.border, backgroundColor: palette.surface }]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholder="Search exercises"
          placeholderTextColor={palette.placeholder}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          value={query}
          onChangeText={setQuery}
          style={[styles.searchInput, { color: palette.text }]}
        />
        {query === '' ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            onPress={() => {
              setQuery('');
            }}
            style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
          >
            <Text style={[styles.clearGlyph, { color: palette.dimmed }]}>✕</Text>
          </Pressable>
        )}
      </View>

      {query === '' && recent.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityLabel="Recent searches"
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

      <Text style={[styles.small, { color: palette.dimmed }]}>Tap one to see the movement.</Text>

      <View style={styles.countRow}>
        <Text testID="result-count" style={[styles.small, { color: palette.text }]}>
          {state.isPending
            ? 'Loading exercises…'
            : results.length === 1
              ? '1 exercise'
              : `${String(results.length)} exercises`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Equipment"
          accessibilityState={{ expanded: choosingEquipment }}
          onPress={() => {
            setChoosingEquipment((open) => !open);
          }}
          style={({ pressed }) => [
            styles.dropdown,
            { borderColor: palette.border, backgroundColor: palette.surface },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.small,
              { color: equipment.length === 0 ? palette.placeholder : palette.text },
            ]}
            numberOfLines={1}
          >
            {equipment.length === 0 ? 'Any equipment' : equipment.join(', ')}
          </Text>
          <Text style={[styles.small, { color: palette.dimmed }]}>
            {choosingEquipment ? '▴' : '▾'}
          </Text>
        </Pressable>
      </View>

      {choosingEquipment ? (
        <View style={styles.equipment} accessibilityLabel="Equipment">
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
          {equipment.length === 0 ? null : (
            <LinkButton
              label="Clear"
              onPress={() => {
                for (const item of equipment) toggleEquipment(item);
              }}
            />
          )}
        </View>
      ) : null}

      {state.isPending ? null : (
        <View style={styles.browse}>
          {/* One bordered block of joined steps, as the web's rail. */}
          <ScrollView
            style={[styles.rail, { borderColor: palette.border }]}
            accessibilityLabel="Filter by body part"
          >
            {[
              { region: null, label: 'All' },
              ...MUSCLE_GROUPS_BY_REGION.map(({ region: name }) => ({ region: name, label: name })),
            ].map((step, index) => {
              const active = region === step.region;
              return (
                <Pressable
                  key={step.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    // Tapping the active region clears it, so the rail needs
                    // no "off" control beyond All.
                    setRegion(active ? null : step.region);
                  }}
                  style={[
                    styles.railStep,
                    index > 0 && { borderTopWidth: 1, borderTopColor: palette.border },
                    active && { backgroundColor: palette.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.railLabel,
                      active
                        ? { color: palette.onAccent, fontWeight: '600' }
                        : { color: palette.dimmed },
                    ]}
                  >
                    {step.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <FlatList
            style={styles.results}
            data={results}
            keyExtractor={(exercise) => exercise.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            initialNumToRender={20}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.small, styles.center, { color: palette.dimmed }]}>
                  No exercises match. Try a shorter search, clear a filter, or add a custom
                  exercise.
                </Text>
                <LinkButton
                  label={query.trim() === '' ? 'Make a new exercise' : `Make “${query.trim()}”`}
                  tone="accent"
                  onPress={onCreate}
                />
              </View>
            }
            renderItem={({ item }) => {
              const primary = item.primaryMuscles.map(muscleLabel).join(', ');
              return (
                <Pressable
                  testID="exercise-result"
                  accessibilityRole="button"
                  onPress={() => {
                    state.remember(query);
                    onSelect(item);
                  }}
                  style={({ pressed }) => [
                    styles.result,
                    { borderBottomColor: palette.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.resultText}>
                    <Text style={[styles.name, { color: palette.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <View style={styles.meta}>
                      {item.isCustom ? <Badge tone="accent" label="Custom" /> : null}
                      <Text
                        style={[styles.small, styles.metaText, { color: palette.dimmed }]}
                        numberOfLines={1}
                      >
                        {primary === '' ? 'No muscles set' : primary}
                        {` · ${equipmentLabel(item.equipment)}`}
                      </Text>
                    </View>
                  </View>
                  {/* On the right, as on the web: the picture tells ten
                      near-identical lateral raises apart. */}
                  <ExerciseThumb exercise={item} />
                  <Text
                    style={[styles.chevron, { color: palette.dimmed }]}
                    accessibilityElementsHidden
                  >
                    ›
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 12,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  clearGlyph: { fontSize: 15 },
  chips: { gap: 8, alignItems: 'center', paddingRight: 16 },
  chipLead: { marginRight: 2 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dropdown: {
    width: 170,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
  },
  equipment: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  browse: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 8 },
  // Wide enough for "Shoulders", as the web's.
  rail: {
    width: 92,
    flexGrow: 0,
    alignSelf: 'flex-start',
    maxHeight: '100%',
    borderWidth: 1,
    borderRadius: 6,
  },
  railStep: { minHeight: 40, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  railLabel: { fontSize: 12, textAlign: 'center' },
  results: { flex: 1, minWidth: 0 },
  list: { paddingBottom: 32 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 62,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultText: { flex: 1, gap: 3 },
  name: { fontSize: 14, fontWeight: '500' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flexShrink: 1 },
  chevron: { fontSize: 18 },
  pressed: { opacity: 0.6 },
  empty: { paddingVertical: 24, paddingHorizontal: 8, gap: 12, alignItems: 'center' },
  center: { textAlign: 'center' },
  small: { fontSize: 13 },
});
