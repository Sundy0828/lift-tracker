import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { usePalette } from '../../theme';

/**
 * One number box in the set grid.
 *
 * Its text is its own state, so a keystroke re-renders this box and nothing
 * else; the value only reaches the row, the draft and Firestore when editing
 * ends. One write per box, not one per digit (§3).
 */

type Props = {
  label: string;
  value: number | null;
  min: number;
  max: number;
  placeholder: string;
  /** Load takes a decimal point; reps do not. */
  decimal: boolean;
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
  min,
  max,
  placeholder,
  decimal,
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

  const commit = (): void => {
    focused.current = false;
    const parsed = parse(text);
    const next = parsed === null ? null : Math.min(max, Math.max(min, parsed));
    setText(format(next));
    onFilled(next !== null);
    if (next !== value) onCommit(next);
  };

  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      placeholder={placeholder}
      placeholderTextColor={palette.dimmed}
      editable={!disabled}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      returnKeyType="done"
      selectTextOnFocus
      onFocus={() => {
        focused.current = true;
      }}
      onChangeText={(next) => {
        setText(next);
        onFilled(next.trim() !== '');
      }}
      onEndEditing={commit}
      style={[
        styles.input,
        { color: palette.text, borderColor: palette.border, backgroundColor: palette.background },
        disabled && styles.disabled,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabled: { opacity: 0.4 },
});
