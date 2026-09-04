import {
  Button,
  Drawer,
  Group,
  NumberInput,
  RangeSlider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { useProfile } from '@/data/hooks/useProfile';
import type { PlanExerciseSlot, Prescription, RepRange } from '@/domain/plans';
import {
  MAX_SETS,
  REPS_MIN_GAP,
  REPS_SOFT_MAX,
  RIR_MIN_GAP,
  RIR_SOFT_MAX,
  formatRange,
  formatRestSeconds,
  normalizePrescription,
  sliderBound,
} from '@/domain/plans';
import classes from './PrescriptionEditor.module.css';

export type SlotEdit = {
  prescription: Prescription;
  notes: string;
  supersetGroup: string | null;
};

type Props = {
  slot: PlanExerciseSlot | null;
  /** Group id to use when the user supersets this slot with the next one. */
  supersetIdFor: () => string;
  onClose: () => void;
  onSave: (slotId: string, edit: SlotEdit) => void;
  onRemove: (slotId: string) => void;
};

const REST_PRESETS = [60, 90, 120, 180, 240];

/**
 * Prescription editor for one slot.
 *
 * Rep and RIR ranges use a two-thumb slider rather than a pair of number
 * fields. A slider cannot represent an inverted range at all: `minRange`
 * keeps the thumbs a fixed distance apart and `pushOnOverlap` moves the far
 * thumb out of the way, so raising the bottom of an 8-12 rep range to 11
 * carries the top to 13 rather than waiting for a collision.
 *
 * Values are still normalised on save, because imported and shared plans
 * arrive from outside this form.
 */
export function PrescriptionEditor({ slot, supersetIdFor, onClose, onSave, onRemove }: Props) {
  const { profile } = useProfile();
  const [draft, setDraft] = useState<SlotEdit | null>(null);

  const current: SlotEdit | null =
    slot === null
      ? null
      : (draft ?? {
          prescription: slot.prescription,
          notes: slot.notes,
          supersetGroup: slot.supersetGroup,
        });

  const close = (): void => {
    setDraft(null);
    onClose();
  };

  const patch = (change: Partial<SlotEdit>): void => {
    if (current === null) return;
    setDraft({ ...current, ...change });
  };

  const patchPrescription = (change: Partial<Prescription>): void => {
    if (current === null) return;
    setDraft({ ...current, prescription: { ...current.prescription, ...change } });
  };

  const asRange = (value: [number, number]): RepRange => ({ min: value[0], max: value[1] });

  return (
    <Drawer
      opened={slot !== null}
      onClose={close}
      position="bottom"
      size="92%"
      title={slot?.exerciseName ?? ''}
    >
      {slot === null || current === null ? null : (
        <Stack gap="lg">
          <NumberInput
            label="Sets"
            min={1}
            max={MAX_SETS}
            clampBehavior="strict"
            allowDecimal={false}
            value={current.prescription.sets}
            onChange={(value) => {
              patchPrescription({
                sets: typeof value === 'number' ? value : current.prescription.sets,
              });
            }}
          />

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Reps
              </Text>
              <Text size="sm" fw={600} className={classes.readout}>
                {formatRange(current.prescription.repRange)}
              </Text>
            </Group>
            <RangeSlider
              min={1}
              max={sliderBound(REPS_SOFT_MAX, current.prescription.repRange.max)}
              step={1}
              minRange={REPS_MIN_GAP}
              label={(value) => String(value)}
              className={classes.sliderRow}
              marks={[
                { value: 1, label: '1' },
                { value: 10, label: '10' },
                { value: 20, label: '20' },
                { value: 30, label: '30' },
              ]}
              value={[current.prescription.repRange.min, current.prescription.repRange.max]}
              onChange={(value) => {
                patchPrescription({ repRange: asRange(value) });
              }}
              aria-label="Rep range"
              thumbFromLabel="Lowest reps"
              thumbToLabel="Highest reps"
            />
          </Stack>

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                RIR
              </Text>
              <Text size="sm" fw={600} className={classes.readout}>
                {formatRange(current.prescription.rirRange)}
              </Text>
            </Group>
            <RangeSlider
              min={0}
              max={sliderBound(RIR_SOFT_MAX, current.prescription.rirRange.max)}
              step={1}
              minRange={RIR_MIN_GAP}
              label={(value) => String(value)}
              className={classes.sliderRow}
              marks={[
                { value: 0, label: '0' },
                { value: 1, label: '1' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' },
                { value: 5, label: '5' },
              ]}
              value={[current.prescription.rirRange.min, current.prescription.rirRange.max]}
              onChange={(value) => {
                patchPrescription({ rirRange: asRange(value) });
              }}
              aria-label="RIR range"
              thumbFromLabel="Lowest RIR"
              thumbToLabel="Highest RIR"
            />
            <Text size="xs" c="dimmed">
              Reps in reserve — how many you could still have done. 0 is failure.
            </Text>
          </Stack>

          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Rest
              </Text>
              {current.prescription.restSeconds === null ? (
                <Text size="sm" c="dimmed">
                  your default, {formatRestSeconds(profile.defaultRestSeconds)}
                </Text>
              ) : (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  onClick={() => {
                    patchPrescription({ restSeconds: null });
                  }}
                >
                  Use my default
                </Button>
              )}
            </Group>
            <Group gap="xs">
              {REST_PRESETS.map((seconds) => (
                <Button
                  key={seconds}
                  size="compact-sm"
                  variant={current.prescription.restSeconds === seconds ? 'filled' : 'default'}
                  onClick={() => {
                    patchPrescription({ restSeconds: seconds });
                  }}
                >
                  {formatRestSeconds(seconds)}
                </Button>
              ))}
            </Group>
            <NumberInput
              aria-label="Rest seconds"
              placeholder={`${formatRestSeconds(profile.defaultRestSeconds)} (your default)`}
              suffix="s"
              min={0}
              max={3600}
              step={15}
              allowDecimal={false}
              value={current.prescription.restSeconds ?? ''}
              onChange={(value) => {
                patchPrescription({ restSeconds: typeof value === 'number' ? value : null });
              }}
            />
          </Stack>

          <TextInput
            label="Load note"
            placeholder="same as last + 5"
            value={current.prescription.loadHint ?? ''}
            onChange={(event) => {
              const next = event.currentTarget.value;
              patchPrescription({ loadHint: next === '' ? null : next });
            }}
          />

          <Textarea
            label="Notes"
            autosize
            minRows={2}
            value={current.notes}
            onChange={(event) => {
              patch({ notes: event.currentTarget.value });
            }}
          />

          <Stack gap={4}>
            <Switch
              label="Superset with the next exercise"
              checked={current.supersetGroup !== null}
              onChange={(event) => {
                patch({ supersetGroup: event.currentTarget.checked ? supersetIdFor() : null });
              }}
            />
            <Text size="xs" c="dimmed">
              Supersets change rest, not volume — set-equivalents are unaffected.
            </Text>
          </Stack>

          <Group justify="space-between">
            <Button
              variant="light"
              color="red"
              onClick={() => {
                onRemove(slot.slotId);
                close();
              }}
            >
              Remove
            </Button>
            <Group>
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onSave(slot.slotId, {
                    ...current,
                    prescription: normalizePrescription(current.prescription),
                  });
                  close();
                }}
              >
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
