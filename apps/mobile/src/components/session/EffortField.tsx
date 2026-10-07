import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';

/**
 * How hard the set was, as four tap targets instead of a typed number. Same
 * scale as the web's `EffortField`: `fail`, `1`, `2`, `3+`, storing the plain
 * RIR number so the estimate, deltas and PRs keep working on a real figure.
 * `3+` stores 3.
 */

const STEPS = [0, 1, 2, 3] as const;
const LABELS: Record<number, string> = { 0: 'fail', 1: '1', 2: '2', 3: '3+' };
const DESCRIPTIONS: Record<number, string> = {
  0: 'to failure, no reps left',
  1: '1 rep left',
  2: '2 reps left',
  3: '3 or more reps left',
};

type Props = {
  setLabel: string;
  value: number | null;
  target: { min: number; max: number } | null;
  disabled: boolean;
  onChange: (rir: number | null) => void;
};

export function EffortField({ setLabel, value, target, disabled, onChange }: Props) {
  const palette = usePalette();
  return (
    <View style={styles.group} accessibilityLabel={`${setLabel} effort, reps in reserve`}>
      {STEPS.map((step) => {
        const selected = value === step;
        // `3+` covers everything from 3 up, so a 3-4 RIR target marks it.
        const inTarget =
          target !== null &&
          (step === 3 ? target.max >= 3 : step >= target.min && step <= target.max);

        return (
          <Pressable
            key={step}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${setLabel}: ${DESCRIPTIONS[step] ?? String(step)}`}
            accessibilityState={{ selected, disabled }}
            onPress={() => {
              void Haptics.selectionAsync();
              // Tapping the chosen one again clears it; a mis-tap is undoable.
              onChange(selected ? null : step);
            }}
            style={[
              styles.step,
              { borderColor: inTarget ? palette.accent : palette.border },
              selected && { backgroundColor: palette.accent, borderColor: palette.accent },
              disabled && styles.disabled,
            ]}
          >
            <Text style={[styles.label, { color: selected ? palette.onAccent : palette.dimmed }]}>
              {LABELS[step] ?? String(step)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', gap: 6 },
  step: {
    minWidth: 44,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  label: { fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
