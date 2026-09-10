import { Alert, Button, Group, Modal, MultiSelect, Select, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { CustomExercise, Equipment } from '@/domain/exercises';
import { EQUIPMENT, isEquipment } from '@/domain/exercises';
import type { MuscleGroup } from '@/domain/muscles';
import { MUSCLE_OPTIONS_BY_REGION, isMuscleGroup } from '@/domain/muscles';

/**
 * Grouped by display region so the list is scannable on a phone. Finer
 * muscles (rear delts, tibialis) sit under their parent region, so picking
 * one is a scroll rather than a lookup.
 */
const MUSCLE_OPTIONS = MUSCLE_OPTIONS_BY_REGION;

const EQUIPMENT_OPTIONS = EQUIPMENT.map((item) => ({ value: item, label: item }));

export type CustomExerciseDraft = {
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment | null;
};

type Props = {
  opened: boolean;
  /** Present when editing; absent when creating. */
  editing?: CustomExercise | undefined;
  existingNames: readonly string[];
  onClose: () => void;
  onSave: (draft: CustomExerciseDraft) => void;
  /** Set when this opens over another modal, such as the exercise picker. */
  zIndex?: number | undefined;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

export function CustomExerciseForm({
  opened,
  editing,
  existingNames,
  onClose,
  onSave,
  zIndex,
}: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [primary, setPrimary] = useState<MuscleGroup[]>(editing?.primaryMuscles ?? []);
  const [secondary, setSecondary] = useState<MuscleGroup[]>(editing?.secondaryMuscles ?? []);
  const [equipment, setEquipment] = useState<Equipment | null>(editing?.equipment ?? null);
  const [submitted, setSubmitted] = useState(false);

  // A dropdown renders in its own portal on a layer below an elevated modal,
  // so without this its options paint underneath the form that opened them
  // and cannot be tapped.
  const dropdown = zIndex === undefined ? {} : { comboboxProps: { zIndex: zIndex + 1 } };

  const trimmed = name.trim();
  const duplicate =
    trimmed !== '' &&
    normalizeName(trimmed) !== normalizeName(editing?.name ?? '') &&
    existingNames.some((existing) => normalizeName(existing) === normalizeName(trimmed));

  const nameError =
    trimmed === '' ? 'Give it a name' : duplicate ? 'You already have one with this name' : null;
  const primaryError = primary.length === 0 ? 'Pick at least one primary muscle' : null;
  const valid = nameError === null && primaryError === null;

  const submit = (): void => {
    setSubmitted(true);
    if (!valid) return;
    onSave({
      name: trimmed,
      primaryMuscles: primary,
      secondaryMuscles: secondary.filter((muscle) => !primary.includes(muscle)),
      equipment,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing === undefined ? 'New exercise' : 'Edit exercise'}
      fullScreen
      transitionProps={{ duration: 120 }}
      // Spread rather than passed: Modal's own default has to survive when
      // this opens on its own screen.
      {...(zIndex === undefined ? {} : { zIndex })}
    >
      <Stack>
        <TextInput
          label="Name"
          placeholder="Cable Y-Raise"
          required
          data-autofocus
          value={name}
          error={submitted ? nameError : null}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />

        <MultiSelect
          label="Primary muscles"
          description="Counted as a full set each in volume math"
          required
          searchable
          data={MUSCLE_OPTIONS}
          value={primary}
          error={submitted ? primaryError : null}
          onChange={(values) => {
            setPrimary(values.filter(isMuscleGroup));
          }}
          {...dropdown}
        />

        <MultiSelect
          label="Secondary muscles"
          description="Counted as half a set each"
          searchable
          data={MUSCLE_OPTIONS}
          value={secondary}
          onChange={(values) => {
            setSecondary(values.filter(isMuscleGroup));
          }}
          {...dropdown}
        />

        <Select
          label="Equipment"
          placeholder="Unspecified"
          clearable
          data={EQUIPMENT_OPTIONS}
          value={equipment}
          onChange={(value) => {
            setEquipment(value !== null && isEquipment(value) ? value : null);
          }}
          {...dropdown}
        />

        {submitted && !valid ? (
          <Alert color="red" variant="light" role="alert">
            Fix the highlighted fields.
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{editing === undefined ? 'Add exercise' : 'Save'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
