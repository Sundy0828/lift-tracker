import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import type { DistanceUnit, Measure } from '@lift/domain/measure';
import {
  DISTANCE_UNITS,
  MEASURES,
  MEASURE_LABELS,
  TARGET_BOUNDS,
  formatTarget,
} from '@lift/domain/measure';
import type { ExerciseSlot, Prescription, RepRange } from '@lift/domain/workouts';
import {
  MAX_REPS,
  MAX_RIR,
  MAX_SETS,
  REPS_MIN_GAP,
  RIR_MIN_GAP,
  formatRange,
  formatRestSeconds,
  normalizePrescription,
  distanceUnitOf,
  measureOf,
  stepRange,
  withMeasure,
} from '@lift/domain/workouts';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { Button, Field, Segmented } from '../ui';
import { Chip, FieldRow, LinkButton, Sheet, Stepper } from './controls';
import { ExerciseDetail } from './ExerciseDetail';

/** What Save writes back to one slot. */
export type SlotEdit = { prescription: Prescription; notes: string };

type Props = {
  slot: ExerciseSlot | null;
  /** In a circuit, the card owns the sets (as rounds); the sheet does not show them. */
  inCircuit: boolean;
  defaultRestSeconds: number;
  onClose: () => void;
  onSave: (slotId: string, edit: SlotEdit) => void;
  onRemove: (slotId: string) => void;
  /** Adds a copy right after it, in the same circuit. Unsaved edits are not copied. */
  onDuplicate: (slotId: string) => void;
};

const REST_PRESETS = [60, 90, 120, 180, 240];
const REST_ROW_PRESETS = [15, 30, 45, 60, 90, 120];
const REST_STEP = 15;
const REST_MAX = 3600;

function clampRest(seconds: number): number {
  return Math.min(REST_MAX, Math.max(0, seconds));
}

/**
 * The rest as an exact number of seconds, as the web's editor takes it, for
 * the odd length the steps and presets do not reach. Commits when typing ends.
 */
function ExactRest({
  seconds,
  onChange,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Field
      label="Exact, in seconds"
      keyboardType="number-pad"
      returnKeyType="done"
      value={text ?? String(seconds)}
      onChangeText={setText}
      onEndEditing={() => {
        const parsed = Number.parseInt(text ?? '', 10);
        if (Number.isFinite(parsed)) onChange(clampRest(parsed));
        setText(null);
      }}
    />
  );
}

/**
 * Edits one slot. The web's `PrescriptionEditor`, laid out for a thumb:
 * steppers instead of sliders and number boxes, and rest presets as chips.
 *
 * The rep and RIR windows step with `stepRange`, which keeps the web slider's
 * behaviour: pushing one end into the other carries it along rather than
 * stopping. Values are normalised on save, as on the web, because imported
 * workouts arrive from outside this form.
 *
 * A circuit member has no Sets here: its set count is the circuit's rounds,
 * which the circuit's card sets for every member at once, as on the web.
 */
export function SlotSheet(props: Props) {
  // The last slot shown, so the content stays put while the sheet slides away.
  const [shown, setShown] = useState<{ slot: ExerciseSlot; inCircuit: boolean } | null>(null);
  if (props.slot !== null && (props.slot !== shown?.slot || props.inCircuit !== shown.inCircuit)) {
    setShown({ slot: props.slot, inCircuit: props.inCircuit });
  }

  return (
    <Sheet
      visible={props.slot !== null}
      title={shown === null ? '' : shown.slot.kind === 'rest' ? 'Rest' : shown.slot.exerciseName}
      onClose={props.onClose}
    >
      {shown === null ? null : (
        // Keyed, so opening another slot starts a fresh draft.
        <SlotForm
          key={shown.slot.slotId}
          {...props}
          slot={shown.slot}
          inCircuit={shown.inCircuit}
        />
      )}
    </Sheet>
  );
}

function SlotForm({
  slot,
  inCircuit,
  defaultRestSeconds,
  onClose,
  onSave,
  onRemove,
  onDuplicate,
}: Props & { slot: ExerciseSlot }) {
  const palette = usePalette();
  const { resolver } = useExerciseLibrary();
  const [prescription, setPrescription] = useState(slot.prescription);
  const [notes, setNotes] = useState(slot.notes);
  const [showingDetail, setShowingDetail] = useState(false);

  const isRest = slot.kind === 'rest';
  // Null for a rest row and for a custom exercise since deleted.
  const exercise = isRest ? null : resolver.resolve(slot.exerciseId);

  const patch = (change: Partial<Prescription>): void => {
    setPrescription((current) => ({ ...current, ...change }));
  };

  const measure: Measure = measureOf(prescription);
  const distanceUnit: DistanceUnit = distanceUnitOf(prescription);
  /**
   * One tap's worth of target: a rep, 15 seconds, or 5 m (half a km or mile).
   * A step that small keeps a hold or a carry to a few taps either way.
   */
  const targetStep =
    measure === 'time'
      ? 15
      : measure === 'distance'
        ? distanceUnit === 'km' || distanceUnit === 'mi'
          ? 0.5
          : 5
        : 1;

  const stepReps = (edge: 'min' | 'max', delta: number): void => {
    const bounds = TARGET_BOUNDS[measure];
    patch({
      repRange: stepRange(prescription.repRange, edge, delta * targetStep, {
        floor: measure === 'reps' ? 1 : bounds.floor,
        ceiling: measure === 'reps' ? MAX_REPS : bounds.ceiling,
        minGap: measure === 'reps' ? REPS_MIN_GAP : Math.min(bounds.minGap, targetStep),
      }),
    });
  };

  const stepRir = (edge: 'min' | 'max', delta: number): void => {
    patch({
      rirRange: stepRange(prescription.rirRange, edge, delta, {
        floor: 0,
        ceiling: MAX_RIR,
        minGap: RIR_MIN_GAP,
      }),
    });
  };

  const save = (): void => {
    onSave(slot.slotId, { prescription: normalizePrescription(prescription), notes });
    onClose();
  };

  const rest = prescription.restSeconds;

  return (
    <View style={styles.root}>
      {exercise === null ? null : showingDetail ? (
        <View style={styles.group}>
          <ExerciseDetail exercise={exercise} />
          <LinkButton
            label="Hide how to do it"
            onPress={() => {
              setShowingDetail(false);
            }}
          />
        </View>
      ) : (
        <LinkButton
          label="How to do it"
          tone="accent"
          onPress={() => {
            setShowingDetail(true);
          }}
        />
      )}

      {isRest ? (
        <View style={styles.group}>
          <FieldRow label="Length">
            <Stepper
              label="Rest"
              value={formatRestSeconds(rest ?? 0)}
              canDecrement={(rest ?? 0) > 0}
              onDecrement={() => {
                patch({ restSeconds: clampRest((rest ?? 0) - REST_STEP) });
              }}
              onIncrement={() => {
                patch({ restSeconds: clampRest((rest ?? 0) + REST_STEP) });
              }}
            />
          </FieldRow>
          <View style={styles.chips}>
            {REST_ROW_PRESETS.map((seconds) => (
              <Chip
                key={seconds}
                label={formatRestSeconds(seconds)}
                selected={rest === seconds}
                onPress={() => {
                  patch({ restSeconds: seconds });
                }}
              />
            ))}
          </View>
          <ExactRest
            seconds={rest ?? 0}
            onChange={(seconds) => {
              patch({ restSeconds: seconds });
            }}
          />
        </View>
      ) : (
        <>
          {inCircuit ? null : (
            <FieldRow label="Sets">
              <Stepper
                label="Sets"
                value={String(prescription.sets)}
                canDecrement={prescription.sets > 1}
                canIncrement={prescription.sets < MAX_SETS}
                onDecrement={() => {
                  patch({ sets: prescription.sets - 1 });
                }}
                onIncrement={() => {
                  patch({ sets: prescription.sets + 1 });
                }}
              />
            </FieldRow>
          )}

          {/* Reps for a lift, time for a hold, distance for a carry or a sled.
              Switching resets the target: 12 reps are not 12 seconds. */}
          <View style={styles.group}>
            <Text style={[styles.label, { color: palette.text }]}>Counted in</Text>
            <Segmented<Measure>
              label="Counted in"
              options={MEASURES.map((value) => ({ value, label: MEASURE_LABELS[value] }))}
              value={measure}
              onChange={(next) => {
                setPrescription((current) => withMeasure(current, next, distanceUnitOf(current)));
              }}
            />
            {measure === 'distance' ? (
              <Segmented<DistanceUnit>
                label="Distance unit"
                options={DISTANCE_UNITS.map((value) => ({ value, label: value }))}
                value={distanceUnit}
                onChange={(next) => {
                  setPrescription((current) => withMeasure(current, 'distance', next));
                }}
              />
            ) : null}
          </View>

          <RangeField
            label={measure === 'reps' ? 'Reps' : measure === 'time' ? 'Time' : 'Distance'}
            range={prescription.repRange}
            format={(range) => formatTarget(range, measure, distanceUnit)}
            formatEnd={(value) => formatTarget({ min: value, max: value }, measure, distanceUnit)}
            onStep={stepReps}
          />
          <RangeField
            label="RIR"
            hint="Reps in reserve: how many you could still have done. 0 is failure."
            range={prescription.rirRange}
            onStep={stepRir}
          />

          <View style={styles.group}>
            <FieldRow
              label={inCircuit ? 'Rest before the next exercise' : 'Rest'}
              {...(rest === null
                ? { hint: `Your default, ${formatRestSeconds(defaultRestSeconds)}` }
                : {})}
            >
              <Stepper
                label="Rest"
                value={formatRestSeconds(rest ?? defaultRestSeconds)}
                canDecrement={(rest ?? defaultRestSeconds) > 0}
                onDecrement={() => {
                  patch({ restSeconds: clampRest((rest ?? defaultRestSeconds) - REST_STEP) });
                }}
                onIncrement={() => {
                  patch({ restSeconds: clampRest((rest ?? defaultRestSeconds) + REST_STEP) });
                }}
              />
            </FieldRow>
            <View style={styles.chips}>
              {REST_PRESETS.map((seconds) => (
                <Chip
                  key={seconds}
                  label={formatRestSeconds(seconds)}
                  selected={rest === seconds}
                  onPress={() => {
                    patch({ restSeconds: seconds });
                  }}
                />
              ))}
              {rest === null ? null : (
                <Chip
                  label="My default"
                  selected={false}
                  onPress={() => {
                    patch({ restSeconds: null });
                  }}
                />
              )}
            </View>
            <ExactRest
              seconds={rest ?? defaultRestSeconds}
              onChange={(seconds) => {
                patch({ restSeconds: seconds });
              }}
            />
          </View>

          <Field
            label="Load note"
            placeholder="same as last + 5"
            value={prescription.loadHint ?? ''}
            onChangeText={(next) => {
              patch({ loadHint: next === '' ? null : next });
            }}
          />
          <Field
            label="Notes"
            multiline
            value={notes}
            onChangeText={setNotes}
            style={styles.notes}
          />
        </>
      )}

      {inCircuit && !isRest ? (
        <Text style={[styles.small, { color: palette.dimmed }]}>
          This exercise is part of a circuit. Its rounds and the pause between rounds are set on the
          circuit itself; the rest above is the pause before the next exercise in the round.
        </Text>
      ) : null}

      {/* The web's footer, in two rows for a phone's width: what changes the
          list on the first, what closes the sheet on the second. */}
      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button
            variant="danger-subtle"
            label="Remove"
            onPress={() => {
              onClose();
              onRemove(slot.slotId);
            }}
          />
        </View>
        <View style={styles.grow}>
          <Button
            variant="subtle"
            label="Duplicate"
            onPress={() => {
              onClose();
              onDuplicate(slot.slotId);
            }}
          />
        </View>
      </View>
      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button variant="subtle" label="Cancel" onPress={onClose} />
        </View>
        <View style={styles.grow}>
          <Button label="Save" onPress={save} />
        </View>
      </View>
    </View>
  );
}

/** A min-max window as two steppers: From and To. */
function RangeField({
  label,
  hint,
  range,
  format = formatRange,
  formatEnd = String,
  onStep,
}: {
  label: string;
  hint?: string;
  range: RepRange;
  /** The readout: `8-12` by default, `30s-1:00` for a time. */
  format?: (range: RepRange) => string;
  /** One end, in the stepper. */
  formatEnd?: (value: number) => string;
  onStep: (edge: 'min' | 'max', delta: number) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.group}>
      <View style={styles.rangeHeader}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.readout, { color: palette.text }]}>{format(range)}</Text>
      </View>
      {hint === undefined ? null : (
        <Text style={[styles.small, { color: palette.dimmed }]}>{hint}</Text>
      )}
      <FieldRow label="From">
        <Stepper
          label={`Lowest ${label}`}
          value={formatEnd(range.min)}
          onDecrement={() => {
            onStep('min', -1);
          }}
          onIncrement={() => {
            onStep('min', 1);
          }}
        />
      </FieldRow>
      <FieldRow label="To">
        <Stepper
          label={`Highest ${label}`}
          value={formatEnd(range.max)}
          onDecrement={() => {
            onStep('max', -1);
          }}
          onIncrement={() => {
            onStep('max', 1);
          }}
        />
      </FieldRow>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 20 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rangeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 15, fontWeight: '600' },
  readout: { fontSize: 17, fontWeight: '700' },
  small: { fontSize: 13 },
  notes: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
});
