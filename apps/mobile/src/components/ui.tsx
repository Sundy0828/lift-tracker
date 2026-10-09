import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { usePalette } from '../theme';

/**
 * The handful of primitives the read-only screens share. Deliberately small:
 * Phase 3 decides what the logging screens need, and a component library
 * built ahead of that would guess wrong.
 */

export function Title({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <Text style={[styles.title, { color: palette.text }]}>{children}</Text>;
}

export function Body({ children, dimmed = false }: { children: ReactNode; dimmed?: boolean }) {
  const palette = usePalette();
  return (
    <Text style={[styles.body, { color: dimmed ? palette.dimmed : palette.text }]}>{children}</Text>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const palette = usePalette();
  const style = [styles.card, { backgroundColor: palette.surface, borderColor: palette.border }];
  if (onPress === undefined) return <View style={style}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'filled',
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'filled' | 'subtle';
  busy?: boolean;
}) {
  const palette = usePalette();
  const filled = variant === 'filled';
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      style={({ pressed }) => [
        styles.button,
        filled
          ? { backgroundColor: palette.accent }
          : { borderColor: palette.border, borderWidth: 1 },
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={filled ? palette.onAccent : palette.text} />
      ) : (
        <Text style={[styles.buttonLabel, { color: filled ? palette.onAccent : palette.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const palette = usePalette();
  const { label, style, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.dimmed }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.dimmed}
        style={[
          styles.input,
          { color: palette.text, borderColor: palette.border, backgroundColor: palette.background },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function Loading() {
  const palette = usePalette();
  return (
    <View style={[styles.center, { backgroundColor: palette.background }]}>
      <ActivityIndicator color={palette.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
  pressed: { opacity: 0.7 },
  // 48 high: the thumb-sized touch target the web theme's `md` buttons aim for.
  button: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  field: { gap: 4 },
  label: { fontSize: 13 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
