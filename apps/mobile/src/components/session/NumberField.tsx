import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePalette } from '../../theme';

/**
 * One number box in the set grid, with − and + either side: the web's
 * `NumberField`.
 *
 * Its text is its own state, so a keystroke re-renders this box and nothing
 * else; the value only reaches the row, the draft and Firestore when editing
 * ends or a step is tapped. One write per box, not one per digit (§3).
 *
 * The steps are what make the next set one tap: same weight plus 5 lb, or one
 * rep more, without the keyboard covering half the screen.
 */

type Props = {
  label: string;
  value: number | null;
  /** What − and + move by: `stepFor(unit)` for a load, 1 for reps. */
  step: number;
  min: number;
  max: number;
  /** Where stepping from an empty box lands: the minimum unless said, 0 for a load. */
  start?: number;
  placeholder: string;
  /** Load takes a decimal point; reps do not. */
  decimal: boolean;
  /**
   * Accepts a minus sign: a load, where negative is assistance. iOS's number
   * pads have no minus key, so it gets the numbers-and-punctuation keyboard;
   * the − step also goes below zero from an empty box.
   */
  signed?: boolean;
  disabled: boolean;
  onCommit: (value: number | null) => void;
  /** Reports whether the box holds anything, as it is typed. */
  onFilled: (filled: boolean) => void;
};

function format(value: number | null): string {
  if (value === null) return '';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function parse(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function NumberField({
  label,
  value,
  step,
  min,
  max,
  start = min,
  placeholder,
  decimal,
  signed = false,
  disabled,
  onCommit,
  onFilled,
}: Props) {
  const palette = usePalette();
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);

  // A value changed from outside (a unit switch, another device) is shown,
  // except while the box is being typed in, so an echo cannot move the caret.
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);

  const commit = (next: number | null): void => {
    const bounded = next === null ? null : Math.min(max, Math.max(min, next));
    setText(format(bounded));
    onFilled(bounded !== null);
    if (bounded !== value) onCommit(bounded);
  };

  const nudge = (direction: 1 | -1): void => {
    void Haptics.selectionAsync();
    // Saves whatever another box was being typed into (see EffortField).
    if (!focused.current) Keyboard.dismiss();
    const current = parse(text) ?? value;
    // From empty, the first tap lands on the minimum rather than one step past it.
    const base = current ?? start - step * direction;
    commit(Math.round((base + step * direction) / step) * step);
  };

  const stepButton = (direction: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${direction === 1 ? 'up' : 'down'}`}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={() => {
        nudge(direction);
      }}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: palette.border }]}
    >
      <Text style={[styles.stepLabel, { color: palette.dimmed }]}>
        {direction === 1 ? '+' : '−'}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.field,
        { borderColor: palette.border, backgroundColor: palette.background },
        disabled && styles.disabled,
      ]}
    >
      {stepButton(-1)}
      <TextInput
        accessibilityLabel={label}
        value={text}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        editable={!disabled}
        keyboardType={
          signed
            ? Platform.OS === 'ios'
              ? 'numbers-and-punctuation'
              : 'numeric'
            : decimal
              ? 'decimal-pad'
              : 'number-pad'
        }
        returnKeyType="done"
        selectTextOnFocus
        onFocus={() => {
          focused.current = true;
        }}
        onChangeText={(next) => {
          setText(next);
          onFilled(next.trim() !== '');
        }}
        onEndEditing={() => {
          focused.current = false;
          commit(parse(text));
        }}
        style={[styles.input, { color: palette.text }]}
      />
      {stepButton(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  step: { width: 28, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 18, fontWeight: '600' },
  input: {
    flex: 1,
    minWidth: 32,
    paddingHorizontal: 0,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabled: { opacity: 0.4 },
});
