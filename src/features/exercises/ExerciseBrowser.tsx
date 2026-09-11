import {
  Alert,
  Button,
  CloseButton,
  Group,
  MultiSelect,
  Skeleton,
  Text,
  TextInput,
} from '@mantine/core';
import type { Equipment, Exercise } from '@/domain/exercises';
import { EQUIPMENT, isEquipment } from '@/domain/exercises';
import { MUSCLE_GROUPS_BY_REGION } from '@/domain/muscles';
import { ExerciseList } from './ExerciseList';
import { PanelHeader } from './Panel';
import classes from './ExerciseBrowser.module.css';

const EQUIPMENT_OPTIONS = EQUIPMENT.map((item) => ({ value: item, label: item }));

type Props = {
  /** Heading of the surface. */
  title: string;
  /** Adds a close button to the heading row. */
  onClose?: (() => void) | undefined;
  /** Opens the custom exercise form. */
  onNew: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Accessible name of the search box. */
  searchLabel: string;
  /** Focuses the search box when a panel opens. */
  autoFocus?: boolean | undefined;
  /** Past searches, offered while the box is empty. */
  recent?: readonly string[] | undefined;
  /** Selected body part, or `null` for every body part. */
  region: string | null;
  onRegionChange: (region: string | null) => void;
  /** Selected equipment. Empty matches any. */
  equipment: readonly Equipment[];
  onEquipmentChange: (equipment: Equipment[]) => void;
  exercises: readonly Exercise[];
  onSelect: (exercise: Exercise) => void;
  /** Dims the count while the results catch up with the query. */
  stale?: boolean | undefined;
  /** Replaces the rail and the list with a placeholder. */
  pending?: boolean | undefined;
  /** Library failure, shown above the search box. */
  error?: string | null | undefined;
};

/**
 * The exercise library: heading, search box, filters and result list.
 *
 * The workout picker and the Exercises screen both render it.
 */
export function ExerciseBrowser({
  title,
  onClose,
  onNew,
  query,
  onQueryChange,
  searchLabel,
  autoFocus,
  recent = [],
  region,
  onRegionChange,
  equipment,
  onEquipmentChange,
  exercises,
  onSelect,
  stale = false,
  pending = false,
  error = null,
}: Props) {
  return (
    <div className={classes.browser}>
      <PanelHeader title={title} onClose={onClose}>
        <Button size="compact-sm" onClick={onNew}>
          New
        </Button>
      </PanelHeader>

      {error === null ? null : (
        <Alert color="red" variant="light" role="alert">
          {error}
        </Alert>
      )}

      <TextInput
        placeholder="Search exercises"
        aria-label={searchLabel}
        data-autofocus={autoFocus === true ? true : undefined}
        value={query}
        onChange={(event) => {
          onQueryChange(event.currentTarget.value);
        }}
        rightSectionPointerEvents="all"
        rightSection={
          query === '' ? null : (
            <CloseButton
              aria-label="Clear search"
              onClick={() => {
                onQueryChange('');
              }}
            />
          )
        }
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
                onQueryChange(entry);
              }}
            >
              {entry}
            </Button>
          ))}
        </Group>
      ) : null}

      <Text size="xs" c="dimmed">
        Tap one to see the movement.
      </Text>

      <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
        <Text size="xs" c={stale ? 'dimmed' : 'bright'} data-testid="result-count">
          {exercises.length === 1 ? '1 exercise' : `${String(exercises.length)} exercises`}
        </Text>
        <MultiSelect
          aria-label="Equipment"
          placeholder={equipment.length === 0 ? 'Any equipment' : undefined}
          size="xs"
          w={150}
          clearable
          data={EQUIPMENT_OPTIONS}
          value={[...equipment]}
          onChange={(values) => {
            onEquipmentChange(values.filter(isEquipment));
          }}
        />
      </Group>

      {pending ? (
        <Skeleton className={classes.placeholder} radius="md" />
      ) : (
        <div className={classes.browse}>
          <div className={classes.rail} role="group" aria-label="Filter by body part">
            <RegionButton
              label="All"
              active={region === null}
              onClick={() => {
                onRegionChange(null);
              }}
            />
            {MUSCLE_GROUPS_BY_REGION.map((entry) => (
              <RegionButton
                key={entry.region}
                label={entry.region}
                active={region === entry.region}
                onClick={() => {
                  // Tapping the active region clears it, so the rail needs no
                  // "off" control of its own beyond All.
                  onRegionChange(region === entry.region ? null : entry.region);
                }}
              />
            ))}
          </div>
          <div className={classes.results}>
            <ExerciseList exercises={exercises} onSelect={onSelect} withChevron fill />
          </div>
        </div>
      )}
    </div>
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
