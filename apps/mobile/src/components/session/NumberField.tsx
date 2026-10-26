import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Commits the box being typed into, if any. Only one has the keyboard. */
let editing: (() => void) | null = null;

/**
 * Commits whatever is typed in the box with the keyboard, synchronously, and
 * puts the keyboard away.
 *
 * The keyboard stays up through a tap on a button (the scroll view lets taps
 * through), and `Keyboard.dismiss()` alone only commits once the native
 * end-editing event comes back, after the button's handler has already read
 * the set. So the tick, skip and Finish call this first.
 */
export function commitTyping(): void {
  editing?.();
  Keyboard.dismiss();
}

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
  /** Text typed since the last commit, or null when there is none. */
  const typed = useRef<string | null>(null);

  // A value changed from outside (a unit switch, another device) is shown,
  // except while the box is being typed in, so an echo cannot move the caret.
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);

  const commit = (next: number | null): void => {
    typed.current = null;
    const bounded = next === null ? null : Math.min(max, Math.max(min, next));
    setText(format(bounded));
    onFilled(bounded !== null);
    if (bounded !== value) onCommit(bounded);
  };

  /** Commits what was typed, once: the end-editing that follows has nothing left. */
  const commitTyped = (): void => {
    if (typed.current !== null) commit(parse(typed.current));
  };
  // Re-pointed after each render, so `commitTyping` reaches the current `value`.
  const self = useRef(commitTyped);
  useEffect(() => {
    self.current = commitTyped;
  });
  const flushSelf = useCallback(() => {
    self.current();
  }, []);
  useEffect(
    () => () => {
      if (editing === flushSelf) editing = null;
    },
    [flushSelf],
  );

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
          editing = flushSelf;
        }}
        onChangeText={(next) => {
          setText(next);
          typed.current = next;
          onFilled(next.trim() !== '');
        }}
        onEndEditing={() => {
          focused.current = false;
          if (editing === flushSelf) editing = null;
          commitTyped();
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
