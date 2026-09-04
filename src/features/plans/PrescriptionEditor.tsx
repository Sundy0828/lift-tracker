import {
  Button,
  Drawer,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import type { PlanExerciseSlot, Prescription } from '@/domain/plans';
import { MAX_REPS, MAX_RIR, MAX_SETS, normalizePrescription } from '@/domain/plans';

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

/**
 * Prescription editor for one slot: sets, rep range, RIR range, rest, notes,
 * and superset grouping. Values are normalised on save (`normalizePrescription`)
 * so a max below a min, or an out-of-range number, cannot be stored.
 */
export function PrescriptionEditor({ slot, supersetIdFor, onClose, onSave, onRemove }: Props) {
  const [draft, setDraft] = useState<SlotEdit | null>(null);

  // Reset the draft whenever a different slot is opened.
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

  const asNumber = (value: string | number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  return (
    <Drawer
      opened={slot !== null}
      onClose={close}
      position="bottom"
      size="90%"
      title={slot?.exerciseName ?? ''}
    >
      {slot === null || current === null ? null : (
        <Stack>
          <NumberInput
            label="Sets"
            min={1}
            max={MAX_SETS}
            clampBehavior="strict"
            value={current.prescription.sets}
            onChange={(value) => {
              patchPrescription({ sets: asNumber(value, current.prescription.sets) });
            }}
          />

          <Group grow>
            <NumberInput
              label="Reps from"
              min={1}
              max={MAX_REPS}
              value={current.prescription.repRange.min}
              onChange={(value) => {
                patchPrescription({
                  repRange: {
                    ...current.prescription.repRange,
                    min: asNumber(value, current.prescription.repRange.min),
                  },
                });
              }}
            />
            <NumberInput
              label="to"
              min={1}
              max={MAX_REPS}
              value={current.prescription.repRange.max}
              onChange={(value) => {
                patchPrescription({
                  repRange: {
                    ...current.prescription.repRange,
                    max: asNumber(value, current.prescription.repRange.max),
                  },
                });
              }}
            />
          </Group>

          <Group grow>
            <NumberInput
              label="RIR from"
              min={0}
              max={MAX_RIR}
              value={current.prescription.rirRange.min}
              onChange={(value) => {
                patchPrescription({
                  rirRange: {
                    ...current.prescription.rirRange,
                    min: asNumber(value, current.prescription.rirRange.min),
                  },
                });
              }}
            />
            <NumberInput
              label="to"
              min={0}
              max={MAX_RIR}
              value={current.prescription.rirRange.max}
              onChange={(value) => {
                patchPrescription({
                  rirRange: {
                    ...current.prescription.rirRange,
                    max: asNumber(value, current.prescription.rirRange.max),
                  },
                });
              }}
            />
          </Group>

          <NumberInput
            label="Rest (seconds)"
            description="Leave empty to use your default"
            min={0}
            max={3600}
            step={15}
            value={current.prescription.restSeconds ?? ''}
            onChange={(value) => {
              patchPrescription({
                restSeconds: value === '' ? null : asNumber(value, 0),
              });
            }}
          />

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

          <Group justify="space-between" mt="sm">
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
