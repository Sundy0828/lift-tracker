import type { ExerciseStats, Overlay, OverlayScope, WorkoutStats } from '@lift/domain/overlay';
import { isComparable, previousSetAt, resolveOverlay, workedPosition } from '@lift/domain/overlay';
import type { LoggedSet, SessionEntry } from '@lift/domain/sessions';
import { assessSet, entryKey as keyOf, isRestEntry } from '@lift/domain/sessions';
import type { DeltaChip } from '@lift/domain/strength';
import { describeComparison, formatSet } from '@lift/domain/strength';
import type { Unit } from '@lift/domain/types';
import { formatPrescription, formatRange, formatRestSeconds } from '@lift/domain/workouts';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette } from '../../theme';
import { OverlayLine } from './OverlayLine';
import type { SetHandlers } from './SetRow';
import { SetRow } from './SetRow';

/**
 * One exercise in the session: its overlay header and its set rows. The
 * overlay is resolved once here and handed down as strings, as on the web.
 */

type Props = SetHandlers & {
  entry: SessionEntry;
  displayUnit: Unit;
  workoutStats: WorkoutStats | null;
  exerciseStats: ExerciseStats | null;
  workoutName: string;
  overlayScope: OverlayScope;
  onNotes: (entryKey: string, notes: string) => void;
  /** Only for ad-hoc rows: a prescribed row belongs to the workout. */
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

type RowOverlay = { previousLabel: string | null; delta: DeltaChip | null };
const NOTHING: RowOverlay = { previousLabel: null, delta: null };

/** Last time's numbers for a set, and a delta only for a tier-1 comparison (§2.6). */
function rowOverlay(
  overlay: Overlay,
  entry: SessionEntry,
  set: LoggedSet,
  displayUnit: Unit,
): RowOverlay {
  if (overlay.kind === 'new' || set.isWarmup) return NOTHING;
  const position = workedPosition(entry, set.setIndex);
  if (position === null) return NOTHING;
  const previous = previousSetAt(overlay.data, position);
  if (previous === null) return NOTHING;
  const previousLabel = formatSet(previous, displayUnit);
  if (!isComparable(overlay)) return { previousLabel, delta: null };
  return { previousLabel, delta: describeComparison(set, previous, displayUnit) };
}

export function EntryCard({
  entry,
  displayUnit,
  workoutStats,
  exerciseStats,
  workoutName,
  overlayScope,
  onNotes,
  onRemoveEntry,
  ...handlers
}: Props) {
  const palette = usePalette();
  const key = keyOf(entry);
  const [notes, setNotes] = useState<string | null>(null);

  if (isRestEntry(entry)) {
    return (
      <View style={[styles.rest, { borderColor: palette.border }]}>
        <Text style={[styles.small, { color: palette.dimmed }]}>
          Rest {formatRestSeconds(entry.prescription?.restSeconds ?? 0)}
        </Text>
      </View>
    );
  }

  const overlay = resolveOverlay(entry, workoutStats, exerciseStats, overlayScope);
  const repRangeLabel =
    entry.prescription === null ? null : formatRange(entry.prescription.repRange);

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={[styles.name, { color: palette.text }]}>
            {entry.exerciseName}
            {entry.occurrenceIndex > 0 ? ` #${String(entry.occurrenceIndex + 1)}` : ''}
          </Text>
          {entry.prescription === null ? (
            <Text style={[styles.small, { color: palette.dimmed }]}>added</Text>
          ) : (
            <Text style={[styles.small, { color: palette.dimmed }]}>
              {formatPrescription(entry.prescription)}
            </Text>
          )}
        </View>
        {overlay.kind === 'new' ? (
          <Text style={[styles.badge, { color: palette.accent, borderColor: palette.accent }]}>
            NEW
          </Text>
        ) : null}
      </View>

      <OverlayLine overlay={overlay} workoutName={workoutName} />

      {entry.sets.map((set) => {
        const { previousLabel, delta } = rowOverlay(overlay, entry, set, displayUnit);
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
            rirTarget={entry.prescription?.rirRange ?? null}
            isWarmup={set.isWarmup}
            skipped={set.skipped}
            isComplete={set.completedAt !== null}
            displayUnit={displayUnit}
            assessment={assessSet(set, entry.prescription)}
            repRangeLabel={repRangeLabel}
            previousLabel={previousLabel}
            deltaLabel={delta?.label ?? null}
            deltaDirection={delta?.direction ?? null}
            {...handlers}
          />
        );
      })}

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            setNotes((current) => (current === null ? entry.notes : null));
          }}
        >
          <Text style={[styles.link, { color: palette.dimmed }]}>
            {notes === null ? (entry.notes === '' ? 'Note' : 'Note ·') : 'Hide note'}
          </Text>
        </Pressable>
        {onRemoveEntry === null ? null : (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              onRemoveEntry(key);
            }}
          >
            <Text style={[styles.link, { color: palette.dimmed }]}>Remove</Text>
          </Pressable>
        )}
      </View>

      {notes === null ? null : (
        <TextInput
          accessibilityLabel={`${entry.exerciseName} note`}
          multiline
          value={notes}
          placeholder="Felt heavy, elbow tucked, …"
          placeholderTextColor={palette.dimmed}
          onChangeText={setNotes}
          onEndEditing={() => {
            if (notes !== entry.notes) onNotes(key, notes);
          }}
          style={[
            styles.notes,
            {
              color: palette.text,
              borderColor: palette.border,
              backgroundColor: palette.background,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  rest: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlock: { flexShrink: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700' },
  small: { fontSize: 13 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  controls: { flexDirection: 'row', gap: 20, justifyContent: 'flex-end', paddingTop: 4 },
  link: { fontSize: 14, fontWeight: '600' },
  notes: { minHeight: 64, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
});
