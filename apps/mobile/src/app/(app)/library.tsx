import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { useLibrary } from '@lift/data/hooks/useLibrary';
import { useMuscleLookup } from '@lift/data/hooks/useMuscleLookup';
import type { LibraryFilter, LibraryLevel, LibraryWorkout } from '@lift/domain/library';
import {
  LIBRARY_LEVELS,
  NO_FILTER,
  asShared,
  describeSize,
  filterLibrary,
  libraryBody,
  libraryTags,
} from '@lift/domain/library';
import { SESSION_STOPS, workoutVolume } from '@lift/domain/volume';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chip, LinkButton, Sheet } from '../../components/editor/controls';
import { ExerciseDetail } from '../../components/editor/ExerciseDetail';
import { MuscleMap } from '../../components/MuscleMap';
import { Screen } from '../../components/Screen';
import { ImportPanel } from '../../components/sharing/ImportPanel';
import { WorkoutPreview } from '../../components/sharing/WorkoutPreview';
import {
  BackTitle,
  Badge,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Loading,
  Row,
  Segmented,
  Small,
} from '../../components/ui';
import { usePalette } from '../../theme';

type Level = 'all' | LibraryLevel;

const LEVEL_OPTIONS: readonly { value: Level; label: string }[] = [
  { value: 'all', label: 'Any' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Inter.' },
  { value: 'advanced', label: 'Advanced' },
];

function isLevel(value: string): value is LibraryLevel {
  return (LIBRARY_LEVELS as readonly string[]).includes(value);
}

/**
 * The global library: browse a seeded workout and take a copy. The web's
 * `LibraryScreen`.
 *
 * Read-only; the seed script fills it. Taking a copy runs the share importer
 * unchanged, so a copy gets a fresh workout and a clean history, or merges
 * into one of yours.
 */
export default function Library() {
  const palette = usePalette();
  const { entries, isPending, error } = useLibrary();
  const { resolver } = useExerciseLibrary();
  const { lookup } = useMuscleLookup();

  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [opened, setOpened] = useState<LibraryWorkout | null>(null);
  /** The exercise whose instructions replace the workout in the sheet. */
  const [detailId, setDetailId] = useState<string | null>(null);

  const tags = useMemo(() => libraryTags(entries), [entries]);
  const shown = useMemo(() => filterLibrary(entries, filter), [entries, filter]);
  // What the open workout trains, from its prescription, as the editor draws it.
  const volume = useMemo(
    () => (opened === null ? null : workoutVolume(libraryBody(opened), lookup)),
    [opened, lookup],
  );

  const narrowed = (filter.tag === null ? 0 : 1) + (filter.level === null ? 0 : 1);
  const detail = detailId === null ? null : resolver.resolve(detailId);

  if (isPending) return <Loading />;

  const close = (): void => {
    setOpened(null);
    setDetailId(null);
  };

  return (
    <Screen>
      <BackTitle title="Library" fallback="/workouts" />
      <Body dimmed>
        Workouts to start from. Taking one makes your own copy — its history starts empty, and
        editing it never touches the original.
      </Body>

      {error !== null ? (
        <Card>
          <Body dimmed>{error}</Body>
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <Body dimmed>
            The library is empty. It is filled by the seed script rather than by anyone publishing
            into it, so there is nothing here until it has been run.
          </Body>
        </Card>
      ) : (
        <>
          <View style={styles.searchRow}>
            <View style={styles.grow}>
              <Field
                label="Search the library"
                placeholder="Search the library"
                autoCorrect={false}
                value={filter.query}
                onChangeText={(query) => {
                  setFilter((current) => ({ ...current, query }));
                }}
              />
            </View>
            <Button
              size="compact"
              variant={filtersOpen || narrowed > 0 ? 'filled' : 'subtle'}
              label={narrowed === 0 ? 'Filters' : `Filters (${String(narrowed)})`}
              onPress={() => {
                setFiltersOpen((current) => !current);
              }}
            />
          </View>

          {/* Behind one button, as on the web: two dozen tags is more screen
              than the results they narrow. */}
          {filtersOpen ? (
            <Card>
              <Segmented
                label="Level"
                options={LEVEL_OPTIONS}
                value={filter.level ?? 'all'}
                onChange={(value) => {
                  setFilter((current) => ({ ...current, level: isLevel(value) ? value : null }));
                }}
              />
              <Small>Tags</Small>
              <Row gap={8}>
                {tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    selected={filter.tag === tag}
                    onPress={() => {
                      setFilter((current) => ({
                        ...current,
                        tag: current.tag === tag ? null : tag,
                      }));
                    }}
                  />
                ))}
              </Row>
            </Card>
          ) : null}

          {narrowed === 0 ? null : (
            <Row>
              {filter.level === null ? null : <Badge tone="accent" label={filter.level} />}
              {filter.tag === null ? null : <Badge tone="accent" label={filter.tag} />}
              <LinkButton
                label="Clear"
                onPress={() => {
                  setFilter((current) => ({ ...NO_FILTER, query: current.query }));
                }}
              />
            </Row>
          )}

          {shown.length === 0 ? (
            <Body dimmed>Nothing matches that. Clear the filters to see everything again.</Body>
          ) : (
            shown.map((entry) => (
              <LibraryRow
                key={entry.id}
                entry={entry}
                onOpen={() => {
                  setOpened(entry);
                }}
              />
            ))
          )}
        </>
      )}

      <Sheet
        visible={opened !== null}
        title={detail?.name ?? opened?.name ?? 'Workout'}
        onClose={
          detail === null
            ? close
            : () => {
                setDetailId(null);
              }
        }
      >
        {opened === null ? null : detail !== null ? (
          // Over the workout, in the same sheet (iOS shows one modal at a time).
          <ExerciseDetail exercise={detail} />
        ) : (
          <View style={styles.sheet}>
            <Body dimmed>{opened.summary}</Body>
            {volume === null || volume.size === 0 ? null : (
              <View style={[styles.mapCard, { borderColor: palette.border }]}>
                <MuscleMap
                  volume={volume}
                  stops={SESSION_STOPS}
                  scopeLabel="this workout"
                  basis="planned"
                />
              </View>
            )}
            <WorkoutPreview body={libraryBody(opened)} onShowExercise={setDetailId} />
            <ImportPanel shared={asShared(opened)} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function LibraryRow({ entry, onOpen }: { entry: LibraryWorkout; onOpen: () => void }) {
  return (
    <Card testID="library-row" onPress={onOpen}>
      <View style={styles.rowHead}>
        <View style={styles.grow}>
          <Heading>{entry.name}</Heading>
          <Small>{entry.summary}</Small>
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onOpen}>
          <Badge tone="accent" label="Look" />
        </Pressable>
      </View>
      <Row>
        <Badge label={entry.level} />
        {entry.daysPerWeek === null ? null : <Badge label={`${String(entry.daysPerWeek)}×/week`} />}
        <Badge label={describeSize(entry)} />
        {entry.equipment.map((item) => (
          <Badge key={item} label={item} />
        ))}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  grow: { flex: 1, gap: 2 },
  sheet: { gap: 12 },
  mapCard: { borderWidth: 1, borderRadius: 8, padding: 12 },
  rowHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});
