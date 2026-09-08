import { Badge, Button, Card, Group, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import type { ExerciseStats, Overlay, WorkoutStats } from '@/domain/overlay';
import { isComparable, previousSetAt, resolveOverlay, workedPosition } from '@/domain/overlay';
import type { LoggedSet, SessionEntry } from '@/domain/sessions';
import { entryKey as keyOf, isRestEntry } from '@/domain/sessions';
import { compareSets, describeDelta, formatSet } from '@/domain/strength';
import type { Unit } from '@/domain/types';
import { formatPrescription, formatRestSeconds } from '@/domain/workouts';
import { OverlayLine } from './OverlayLine';
import { SetRow } from './SetRow';
import classes from './EntryCard.module.css';

/**
 * One exercise in the session: its overlay header and its set rows.
 *
 * The overlay is resolved once here and then handed down as formatted strings,
 * so the tier decision is made in one place and the set rows stay primitive
 * (see ./SetRow).
 */

export type SetHandlers = {
  onWeight: (entryKey: string, setIndex: number, value: number | null, unit: Unit) => void;
  onReps: (entryKey: string, setIndex: number, value: number | null) => void;
  onRir: (entryKey: string, setIndex: number, value: number | null) => void;
  onToggleComplete: (entryKey: string, setIndex: number) => void;
  onToggleSkipped: (entryKey: string, setIndex: number) => void;
  onToggleWarmup: (entryKey: string, setIndex: number) => void;
  onRemove: (entryKey: string, setIndex: number) => void;
};

type Props = SetHandlers & {
  entry: SessionEntry;
  displayUnit: Unit;
  workoutStats: WorkoutStats | null;
  exerciseStats: ExerciseStats | null;
  /** The workout being performed, so tier 1 can be labelled with its name. */
  workoutName: string;
  onAddSet: (entryKey: string) => void;
  onNotes: (entryKey: string, notes: string) => void;
  /** Only offered for ad-hoc rows: a prescribed row belongs to the workout. */
  onRemoveEntry: ((entryKey: string) => void) | null;
};

/** Warmups are lettered so the working sets keep 1, 2, 3 whatever precedes them. */
const WARMUP_LABELS = 'WXYZ';

function ordinalFor(sets: readonly LoggedSet[], set: LoggedSet): string {
  if (set.isWarmup) {
    const position = sets.filter((other) => other.isWarmup).indexOf(set);
    return WARMUP_LABELS[position] ?? 'W';
  }
  return String(sets.filter((other) => !other.isWarmup).indexOf(set) + 1);
}

/**
 * The per-row overlay text.
 *
 * Only tier 1 produces a delta. Tier 2 still shows last time's numbers — it is
 * a useful hint at what to load — but comparing across day types would produce
 * a progression figure that means nothing (§2.6).
 */
function rowOverlay(
  overlay: Overlay,
  entry: SessionEntry,
  set: LoggedSet,
  displayUnit: Unit,
): { previousLabel: string | null; deltaLabel: string | null } {
  if (overlay.kind === 'new' || set.isWarmup) return { previousLabel: null, deltaLabel: null };

  const position = workedPosition(entry, set.setIndex);
  if (position === null) return { previousLabel: null, deltaLabel: null };

  const previous = previousSetAt(overlay.data, position);
  if (previous === null) return { previousLabel: null, deltaLabel: null };

  const previousLabel = formatSet(previous, displayUnit);
  if (!isComparable(overlay)) return { previousLabel, deltaLabel: null };

  const comparison = compareSets(set, previous);
  return {
    previousLabel,
    deltaLabel: comparison === null ? null : describeDelta(comparison, displayUnit),
  };
}

function directionOf(
  overlay: Overlay,
  entry: SessionEntry,
  set: LoggedSet,
): 'up' | 'down' | 'same' | null {
  if (!isComparable(overlay) || set.isWarmup) return null;
  const position = workedPosition(entry, set.setIndex);
  if (position === null) return null;
  const previous = previousSetAt(overlay.data, position);
  if (previous === null) return null;
  return compareSets(set, previous)?.direction ?? null;
}

export function EntryCard({
  entry,
  displayUnit,
  workoutStats,
  exerciseStats,
  workoutName,
  onAddSet,
  onNotes,
  onRemoveEntry,
  ...handlers
}: Props) {
  const key = keyOf(entry);
  const [notes, setNotes] = useState<string | null>(null);
  const overlay = resolveOverlay(entry, workoutStats, exerciseStats);

  if (isRestEntry(entry)) {
    return (
      <Card withBorder padding="xs" className={classes.restCard}>
        <Group gap="xs">
          <Text size="sm" fw={550} c="dimmed">
            Rest
          </Text>
          <Text size="sm" c="dimmed">
            {formatRestSeconds(entry.prescription?.restSeconds ?? 0)}
          </Text>
        </Group>
      </Card>
    );
  }

  return (
    <Card withBorder padding="sm" data-testid={`entry-${key}`}>
      <Stack gap={6}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Stack gap={2}>
            <Group gap={6} wrap="nowrap">
              <Text fw={600}>{entry.exerciseName}</Text>
              {/* Only shown from the second occurrence: "#1" on a lift that
                  appears once would be noise. */}
              {entry.occurrenceIndex > 0 ? (
                <Badge size="xs" variant="light" color="gray">
                  #{entry.occurrenceIndex + 1}
                </Badge>
              ) : null}
              {entry.slotId === null ? (
                <Badge size="xs" variant="light" color="gray">
                  added
                </Badge>
              ) : null}
            </Group>
            {entry.prescription === null ? null : (
              <Text size="xs" c="dimmed">
                {formatPrescription(entry.prescription)}
              </Text>
            )}
          </Stack>
          {overlay.kind === 'new' ? (
            <Badge size="sm" variant="light" color="amber">
              NEW
            </Badge>
          ) : null}
        </Group>

        <OverlayLine overlay={overlay} workoutName={workoutName} />

        <div>
          {entry.sets.map((set) => {
            const { previousLabel, deltaLabel } = rowOverlay(overlay, entry, set, displayUnit);
            return (
              <SetRow
                key={set.setIndex}
                entryKey={key}
                setIndex={set.setIndex}
                ordinal={ordinalFor(entry.sets, set)}
                weight={set.weight?.value ?? null}
                weightUnit={set.weight?.unit ?? displayUnit}
                reps={set.reps}
                rir={set.rir}
                isWarmup={set.isWarmup}
                skipped={set.skipped}
                isComplete={set.completedAt !== null}
                displayUnit={displayUnit}
                previousLabel={previousLabel}
                deltaLabel={deltaLabel}
                deltaDirection={directionOf(overlay, entry, set)}
                {...handlers}
              />
            );
          })}
        </div>

        <Group gap="xs">
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => {
              onAddSet(key);
            }}
          >
            + Set
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => {
              setNotes((current) => (current === null ? entry.notes : null));
            }}
          >
            {notes === null ? 'Note' : 'Hide note'}
          </Button>
          {onRemoveEntry === null ? null : (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                onRemoveEntry(key);
              }}
            >
              Remove
            </Button>
          )}
        </Group>

        {notes === null ? null : (
          <Textarea
            aria-label={`${entry.exerciseName} note`}
            autosize
            minRows={2}
            size="sm"
            placeholder="Felt heavy, elbow tucked, …"
            value={notes}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
            }}
            onBlur={() => {
              if (notes !== entry.notes) onNotes(key, notes);
            }}
          />
        )}
      </Stack>
    </Card>
  );
}
