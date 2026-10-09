import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
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
  stepRange,
} from '@lift/domain/workouts';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { Button, Field } from '../ui';
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
};

const REST_PRESETS = [60, 90, 120, 180, 240];
const REST_ROW_PRESETS = [15, 30, 45, 60, 90, 120];
const REST_STEP = 15;
const REST_MAX = 3600;

function clampRest(seconds: number): number {
  return Math.min(REST_MAX, Math.max(0, seconds));
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
}: Props & { slot: ExerciseSlot }) {
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

  const stepReps = (edge: 'min' | 'max', delta: number): void => {
    patch({
      repRange: stepRange(prescription.repRange, edge, delta, {
        floor: 1,
        ceiling: MAX_REPS,
        minGap: REPS_MIN_GAP,
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

          <RangeField label="Reps" range={prescription.repRange} onStep={stepReps} />
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

      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button variant="subtle" label="Cancel" onPress={onClose} />
        </View>
        <View style={styles.grow}>
          <Button label="Save" onPress={save} />
        </View>
      </View>

      <View style={styles.links}>
        <LinkButton
          label={isRest ? 'Remove this rest' : `Remove ${slot.exerciseName}`}
          tone="danger"
          onPress={() => {
            onClose();
            onRemove(slot.slotId);
          }}
        />
      </View>
    </View>
  );
}

/** A min-max window as two steppers: From and To. */
function RangeField({
  label,
  hint,
  range,
  onStep,
}: {
  label: string;
  hint?: string;
  range: RepRange;
  onStep: (edge: 'min' | 'max', delta: number) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.group}>
      <View style={styles.rangeHeader}>
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.readout, { color: palette.text }]}>{formatRange(range)}</Text>
      </View>
      {hint === undefined ? null : (
        <Text style={[styles.small, { color: palette.dimmed }]}>{hint}</Text>
      )}
      <FieldRow label="From">
        <Stepper
          label={`Lowest ${label}`}
          value={String(range.min)}
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
          value={String(range.max)}
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
  links: { gap: 16, alignItems: 'flex-start' },
});
