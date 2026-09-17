import {
  Badge,
  Button,
  Card,
  Group,
  Indicator,
  Popover,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { BackTitle } from '@/app/BackTitle';
import { MuscleMap } from '@/components/MuscleMap';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { useLibrary } from '@/data/hooks/useLibrary';
import { useMuscleLookup } from '@/data/hooks/useMuscleLookup';
import type { LibraryFilter, LibraryLevel, LibraryWorkout } from '@/domain/library';
import {
  LIBRARY_LEVELS,
  NO_FILTER,
  asShared,
  describeSize,
  filterLibrary,
  libraryBody,
  libraryTags,
} from '@/domain/library';
import { SESSION_STOPS, workoutVolume } from '@/domain/volume';
import { ExerciseDetailDrawer } from '@/features/exercises/ExerciseDetailDrawer';
import { Panel, PanelHeader } from '@/features/exercises/Panel';
import { ImportPanel } from '@/features/sharing/ImportPanel';
import { WorkoutPreview } from '@/features/sharing/WorkoutPreview';

/**
 * The global library: browse a seeded workout and take a copy.
 *
 * **Read-only, and there is no way to publish into it** (IDEAS §3). Moderation
 * is a product rather than a checkbox, and the browse half is most of the value
 * for a fraction of the work — so the collection is world-readable, the rules
 * refuse every client write, and `scripts/seed-library.ts` fills it.
 *
 * Taking a copy runs the **share importer**, unchanged. A library entry holds
 * catalog ids only, so it converts to the payload that path already takes and
 * inherits the whole thing: a fresh workout id, a clean overlay history, and
 * the merge-into-an-existing-workout option (§2.9).
 */
export default function LibraryScreen() {
  const { entries, isPending, error } = useLibrary();
  const { resolver } = useExerciseLibrary();
  const { lookup } = useMuscleLookup();

  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [opened, setOpened] = useState<LibraryWorkout | null>(null);
  /** The exercise whose instructions are open over the workout. */
  const [detailId, setDetailId] = useState<string | null>(null);

  const tags = useMemo(() => libraryTags(entries), [entries]);
  const shown = useMemo(() => filterLibrary(entries, filter), [entries, filter]);

  // What the open workout trains, from its prescription — the same map the
  // workout editor draws, so a copy is judged the way your own would be.
  const volume = useMemo(
    () => (opened === null ? null : workoutVolume(libraryBody(opened), lookup)),
    [opened, lookup],
  );

  const narrowed = (filter.tag === null ? 0 : 1) + (filter.level === null ? 0 : 1);

  if (isPending) return <Skeleton height={420} radius="md" />;

  return (
    <Stack>
      <BackTitle to="/workouts" title="Library" />

      <Text size="sm" c="dimmed">
        Workouts to start from. Taking one makes your own copy — its history starts empty, and
        editing it never touches the original.
      </Text>

      {error !== null ? (
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {error}
          </Text>
        </Card>
      ) : entries.length === 0 ? (
        <Card withBorder>
          <Text size="sm" c="dimmed">
            The library is empty. It is filled by the seed script rather than by anyone publishing
            into it, so there is nothing here until it has been run.
          </Text>
        </Card>
      ) : (
        <>
          {/* The filters sit behind one button rather than as a row of chips:
              two dozen tags is more screen than the results they narrow. */}
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              placeholder="Search the library"
              aria-label="Search the library"
              style={{ flex: 1, minWidth: 0 }}
              value={filter.query}
              onChange={(event) => {
                setFilter((current) => ({ ...current, query: event.currentTarget.value }));
              }}
            />
            <FilterMenu
              tags={tags}
              filter={filter}
              active={narrowed}
              onChange={setFilter}
              style={{ flexShrink: 0 }}
            />
          </Group>

          {narrowed === 0 ? null : (
            <Group gap={6}>
              {filter.level === null ? null : (
                <Badge variant="light" color="sky">
                  {filter.level}
                </Badge>
              )}
              {filter.tag === null ? null : (
                <Badge variant="light" color="sky">
                  {filter.tag}
                </Badge>
              )}
              <UnstyledButton
                onClick={() => {
                  setFilter((current) => ({ ...NO_FILTER, query: current.query }));
                }}
              >
                <Badge variant="subtle" color="gray" style={{ cursor: 'pointer' }}>
                  Clear
                </Badge>
              </UnstyledButton>
            </Group>
          )}

          {shown.length === 0 ? (
            <Text size="sm" c="dimmed">
              Nothing matches that. Clear the filters to see everything again.
            </Text>
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

      <Panel
        opened={opened !== null}
        onClose={() => {
          setOpened(null);
          setDetailId(null);
        }}
        label={opened?.name ?? 'Workout'}
      >
        {opened === null ? null : (
          <Stack gap="sm">
            <PanelHeader
              title={opened.name}
              onClose={() => {
                setOpened(null);
              }}
            />
            <Text size="sm" c="dimmed">
              {opened.summary}
            </Text>

            {volume === null || volume.size === 0 ? null : (
              <Card withBorder padding="sm">
                <MuscleMap
                  volume={volume}
                  basis="planned"
                  stops={SESSION_STOPS}
                  scopeLabel="this workout"
                  testId="library-muscle-map"
                />
              </Card>
            )}

            <WorkoutPreview body={libraryBody(opened)} onShowExercise={setDetailId} />
            <ImportPanel shared={asShared(opened)} />
          </Stack>
        )}
      </Panel>

      {/* Over the workout panel, so the instructions do not replace what you
          were reading. */}
      <ExerciseDetailDrawer
        exercise={detailId === null ? null : resolver.resolve(detailId)}
        zIndex={400}
        onClose={() => {
          setDetailId(null);
        }}
      />
    </Stack>
  );
}

type FilterMenuProps = {
  tags: readonly string[];
  filter: LibraryFilter;
  /** How many filters are on, for the button's badge. */
  active: number;
  onChange: (next: LibraryFilter) => void;
  style?: React.CSSProperties;
};

function FilterMenu({ tags, filter, active, onChange, style }: FilterMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" width={260} withArrow>
      <Popover.Target>
        <Indicator label={String(active)} size={16} disabled={active === 0} color="sky">
          <Button
            variant="default"
            aria-label="Filter the library"
            style={style}
            onClick={() => {
              setOpen((current) => !current);
            }}
          >
            Filters
          </Button>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            size="xs"
            value={filter.level ?? 'all'}
            onChange={(value) => {
              onChange({
                ...filter,
                level: (LIBRARY_LEVELS as readonly string[]).includes(value)
                  ? (value as LibraryLevel)
                  : null,
              });
            }}
            data={[
              { value: 'all', label: 'Any' },
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Inter.' },
              { value: 'advanced', label: 'Advanced' },
            ]}
            aria-label="Level"
          />

          <Text size="xs" c="dimmed">
            Tags
          </Text>
          <Group gap={6}>
            {tags.map((one) => (
              <UnstyledButton
                key={one}
                aria-pressed={filter.tag === one}
                onClick={() => {
                  onChange({ ...filter, tag: filter.tag === one ? null : one });
                }}
              >
                <Badge
                  variant={filter.tag === one ? 'filled' : 'light'}
                  color={filter.tag === one ? 'sky' : 'gray'}
                  style={{ cursor: 'pointer' }}
                >
                  {one}
                </Badge>
              </UnstyledButton>
            ))}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function LibraryRow({ entry, onOpen }: { entry: LibraryWorkout; onOpen: () => void }) {
  return (
    <Card withBorder padding="sm" data-testid="library-row">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {entry.name}
            </Text>
            <Text size="xs" c="dimmed">
              {entry.summary}
            </Text>
          </Stack>
          <Button size="compact-sm" variant="light" onClick={onOpen} style={{ flexShrink: 0 }}>
            Look
          </Button>
        </Group>

        <Group gap={6}>
          <Badge size="xs" variant="light" color="gray">
            {entry.level}
          </Badge>
          {entry.daysPerWeek === null ? null : (
            <Badge size="xs" variant="light" color="gray">
              {entry.daysPerWeek}×/week
            </Badge>
          )}
          <Badge size="xs" variant="light" color="gray">
            {describeSize(entry)}
          </Badge>
          {entry.equipment.map((item) => (
            <Badge key={item} size="xs" variant="light" color="gray">
              {item}
            </Badge>
          ))}
        </Group>
      </Stack>
    </Card>
  );
}
