import type { Equipment } from '@lift/domain/exercises';
import { EQUIPMENT, normalizeExerciseName } from '@lift/domain/exercises';
import type { MuscleGroup } from '@lift/domain/muscles';
import { MUSCLE_GROUPS_BY_REGION, muscleLabel } from '@lift/domain/muscles';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { Button, Field } from '../ui';
import { Chip } from './controls';

export type CustomExerciseDraft = {
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment | null;
};

type Props = {
  /** What was typed in the search box: usually the name being looked for. */
  initialName: string;
  existingNames: readonly string[];
  onCancel: () => void;
  onSave: (draft: CustomExerciseDraft) => void;
};

/** Muscle chips grouped by body part, so the list scans rather than scrolls. */
function MusclePicker({
  selected,
  onToggle,
}: {
  selected: readonly MuscleGroup[];
  onToggle: (muscle: MuscleGroup) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.regions}>
      {MUSCLE_GROUPS_BY_REGION.map(({ region, muscles }) => (
        <View key={region} style={styles.region}>
          <Text style={[styles.small, { color: palette.dimmed }]}>{region}</Text>
          <View style={styles.chips}>
            {muscles.map((muscle) => (
              <Chip
                key={muscle}
                label={muscleLabel(muscle)}
                selected={selected.includes(muscle)}
                onPress={() => {
                  onToggle(muscle);
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((other) => other !== item) : [...list, item];
}

/**
 * A new custom exercise: the web's `CustomExerciseForm`, with chips in place
 * of drop-downs. Same rules: a name not already used, at least one primary
 * muscle, and a secondary muscle that is also primary counts once, as primary.
 */
export function CustomExerciseForm({ initialName, existingNames, onCancel, onSave }: Props) {
  const palette = usePalette();
  const [name, setName] = useState(initialName);
  const [primary, setPrimary] = useState<MuscleGroup[]>([]);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const trimmed = name.trim();
  const duplicate =
    trimmed !== '' &&
    existingNames.some(
      (existing) => normalizeExerciseName(existing) === normalizeExerciseName(trimmed),
    );
  const nameError =
    trimmed === '' ? 'Give it a name' : duplicate ? 'You already have one with this name' : null;
  const primaryError = primary.length === 0 ? 'Pick at least one primary muscle' : null;

  const submit = (): void => {
    setSubmitted(true);
    if (nameError !== null || primaryError !== null) return;
    onSave({
      name: trimmed,
      primaryMuscles: primary,
      secondaryMuscles: secondary.filter((muscle) => !primary.includes(muscle)),
      equipment,
    });
  };

  return (
    <View style={styles.root}>
      <Field
        label="Name"
        placeholder="Cable Y-Raise"
        value={name}
        autoFocus={initialName === ''}
        onChangeText={setName}
      />
      {submitted && nameError !== null ? (
        <Text style={[styles.small, { color: palette.danger }]}>{nameError}</Text>
      ) : null}

      <View style={styles.group}>
        <Text style={[styles.label, { color: palette.text }]}>Primary muscles</Text>
        <Text style={[styles.small, { color: palette.dimmed }]}>
          Counted as a full set each in volume
        </Text>
        {submitted && primaryError !== null ? (
          <Text style={[styles.small, { color: palette.danger }]}>{primaryError}</Text>
        ) : null}
        <MusclePicker
          selected={primary}
          onToggle={(muscle) => {
            setPrimary((current) => toggle(current, muscle));
          }}
        />
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: palette.text }]}>Secondary muscles</Text>
        <Text style={[styles.small, { color: palette.dimmed }]}>Counted as half a set each</Text>
        <MusclePicker
          selected={secondary}
          onToggle={(muscle) => {
            setSecondary((current) => toggle(current, muscle));
          }}
        />
      </View>

      <View style={styles.group}>
        <Text style={[styles.label, { color: palette.text }]}>Equipment</Text>
        <View style={styles.chips}>
          {EQUIPMENT.map((item) => (
            <Chip
              key={item}
              label={item}
              selected={equipment === item}
              onPress={() => {
                setEquipment(equipment === item ? null : item);
              }}
            />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button variant="subtle" label="Cancel" onPress={onCancel} />
        </View>
        <View style={styles.grow}>
          <Button label="Add exercise" onPress={submit} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  group: { gap: 6 },
  regions: { gap: 10, paddingTop: 4 },
  region: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
});
