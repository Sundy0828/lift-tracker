import type { ExerciseStats, Overlay, OverlayScope, WorkoutStats } from '@lift/domain/overlay';
import { isComparable, previousSetAt, resolveOverlay, workedPosition } from '@lift/domain/overlay';
import type { LoggedSet, SessionEntry } from '@lift/domain/sessions';
import type { DistanceUnit, Measure } from '@lift/domain/measure';
import { DISTANCE_UNITS, MEASURES, MEASURE_LABELS, amountInput } from '@lift/domain/measure';
import {
  assessSet,
  entryDistanceUnit,
  entryMeasure,
  hasEnteredSets,
  entryKey as keyOf,
  isRestEntry,
  setAmountIn,
} from '@lift/domain/sessions';
import type { DeltaChip } from '@lift/domain/strength';
import { describeComparison, formatSet } from '@lift/domain/strength';
import type { Handedness, Unit } from '@lift/domain/types';
import {
  formatPrescription,
  formatPrescriptionTarget,
  formatRestSeconds,
} from '@lift/domain/workouts';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette } from '../../theme';
import { Segmented } from '../ui';
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
  /** Opens the exercise's instructions over the session; the rest keeps running. */
  onShowExercise: ((exerciseId: string) => void) | null;
  /** Which side the card's controls sit on: under the thumb that logs. */
  handedness: Handedness;
  /** Counts an ad-hoc row in another measure, before anything is logged on it. */
  onMeasure: ((entryKey: string, measure: Measure, unit: DistanceUnit) => void) | null;
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
  onShowExercise,
  handedness,
  onMeasure,
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
  const measure = entryMeasure(entry);
  const distanceUnit = entryDistanceUnit(entry);
  const input = amountInput(measure, distanceUnit);
  // Named in the off-target note, so "under 8-12" or "under 30s-1:00" reads on its own.
  const targetLabel =
    entry.prescription === null ? null : formatPrescriptionTarget(entry.prescription);
  // Only an ad-hoc row picks its measure, and only before it holds a number.
  const choosingMeasure =
    onMeasure !== null && entry.prescription === null && !hasEnteredSets(entry);

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

      {choosingMeasure ? (
        <View style={styles.measure}>
          <Segmented<Measure>
            label={`Count ${entry.exerciseName} in`}
            options={MEASURES.map((value) => ({ value, label: MEASURE_LABELS[value] }))}
            value={measure}
            onChange={(next) => {
              onMeasure(key, next, distanceUnit);
            }}
          />
          {measure === 'distance' ? (
            <Segmented<DistanceUnit>
              label="Distance unit"
              options={DISTANCE_UNITS.map((value) => ({ value, label: value }))}
              value={distanceUnit}
              onChange={(next) => {
                onMeasure(key, 'distance', next);
              }}
            />
          ) : null}
        </View>
      ) : null}

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
            measure={measure}
            amount={setAmountIn(set, measure, distanceUnit)}
            amountPlaceholder={input.placeholder}
            amountStep={input.step}
            amountMax={input.max}
            amountDecimal={input.decimal}
            rir={set.rir}
            rirTarget={entry.prescription?.rirRange ?? null}
            isWarmup={set.isWarmup}
            skipped={set.skipped}
            isComplete={set.completedAt !== null}
            displayUnit={displayUnit}
            assessment={assessSet(set, entry.prescription, measure)}
            targetLabel={targetLabel}
            previousLabel={previousLabel}
            deltaLabel={delta?.label ?? null}
            deltaDirection={delta?.direction ?? null}
            deltaDetail={delta?.detail ?? null}
            {...handlers}
          />
        );
      })}

      {/* Mirrored for a right hand, as on the web: How to lands under the
          thumb and Remove furthest from it. */}
      <View style={[styles.controls, handedness === 'right' ? styles.right : styles.left]}>
        {onShowExercise === null ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`How to do ${entry.exerciseName}`}
            hitSlop={8}
            onPress={() => {
              onShowExercise(entry.exerciseId);
            }}
          >
            <Text style={[styles.link, { color: palette.dimmed }]}>How to</Text>
          </Pressable>
        )}
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
  measure: { gap: 6, paddingVertical: 4 },
  card: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
  rest: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleBlock: { flexShrink: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
  small: { fontSize: 12 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  controls: { flexDirection: 'row', gap: 20, paddingTop: 4 },
  // Reversed, so the first control (How to) sits at the right edge.
  right: { flexDirection: 'row-reverse' },
  left: { justifyContent: 'flex-start' },
  link: { fontSize: 13, fontWeight: '600' },
  notes: { minHeight: 56, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 14 },
});
