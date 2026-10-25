import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { usePalette, type Palette } from '../theme';

/**
 * The primitives every screen shares: text, cards, buttons and fields, plus
 * the few Mantine pieces the web screens lean on (badge, segmented control,
 * alert, switch). Each is drawn to the web's density: 14 px body, 12 px
 * captions, 8 px radius.
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

/** A card's heading, the web's `<Text fw={600}>`. */
export function Heading({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <Text style={[styles.heading, { color: palette.text }]}>{children}</Text>;
}

/** The web's `size="xs" c="dimmed"`: a caption under something else. */
export function Small({
  children,
  dimmed = true,
  numberOfLines,
  testID,
}: {
  children: ReactNode;
  dimmed?: boolean;
  numberOfLines?: number;
  testID?: string;
}) {
  const palette = usePalette();
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[styles.small, { color: dimmed ? palette.dimmed : palette.text }]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  onPress,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const palette = usePalette();
  const style = [styles.card, { backgroundColor: palette.surface, borderColor: palette.border }];
  if (onPress === undefined)
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'filled' | 'subtle' | 'danger' | 'danger-subtle';

function buttonColors(
  variant: ButtonVariant,
  palette: Palette,
): { background: string | undefined; border: string | undefined; label: string } {
  switch (variant) {
    case 'filled':
      return { background: palette.accent, border: undefined, label: palette.onAccent };
    case 'danger':
      return { background: palette.danger, border: undefined, label: '#ffffff' };
    case 'danger-subtle':
      return { background: undefined, border: palette.border, label: palette.danger };
    case 'subtle':
      return { background: undefined, border: palette.border, label: palette.text };
  }
}

export function Button({
  label,
  onPress,
  variant = 'filled',
  size = 'md',
  busy = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `compact` for a row of small actions: the web's `compact-sm`. */
  size?: 'md' | 'compact';
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const palette = usePalette();
  const colors = buttonColors(variant, palette);
  const inert = busy || disabled;
  return (
    <Pressable
      testID={testID}
      onPress={inert ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      // The compact button is drawn small but still answers a thumb.
      hitSlop={size === 'compact' ? 6 : 0}
      style={({ pressed }) => [
        size === 'compact' ? styles.buttonCompact : styles.button,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderWidth: colors.border === undefined ? 0 : 1,
        },
        disabled && styles.disabled,
        pressed && !inert && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.label} />
      ) : (
        <Text
          style={[
            size === 'compact' ? styles.buttonLabelCompact : styles.buttonLabel,
            { color: colors.label },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(
  props: TextInputProps & { label: string; description?: string; error?: string | null },
) {
  const palette = usePalette();
  const { label, description, error = null, style, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.dimmed }]}>{label}</Text>
      {description === undefined ? null : (
        <Text style={[styles.small, { color: palette.dimmed }]}>{description}</Text>
      )}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.placeholder}
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: error === null ? palette.border : palette.danger,
            backgroundColor: palette.background,
          },
          style,
        ]}
        {...rest}
      />
      {error === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.small, { color: palette.danger }]}>
          {error}
        </Text>
      )}
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

/** `#rrggbb` at `alpha`: Mantine's light variants are the colour at low opacity. */
export function tint(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${String((value >> 16) & 255)}, ${String((value >> 8) & 255)}, ${String(value & 255)}, ${String(alpha)})`;
}

export type Tone = 'gray' | 'accent' | 'orange' | 'danger' | 'success';

function toneColor(tone: Tone, palette: Palette): string {
  switch (tone) {
    case 'gray':
      return palette.dimmed;
    case 'accent':
      return palette.accent;
    case 'orange':
      return palette.warn;
    case 'danger':
      return palette.down;
    case 'success':
      return palette.up;
  }
}

/** The web's `<Badge variant="light">`: a small label on a tint of its colour. */
export function Badge({
  label,
  tone = 'gray',
  testID,
}: {
  label: string;
  tone?: Tone;
  testID?: string;
}) {
  const palette = usePalette();
  const color = toneColor(tone, palette);
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: tint(color, 0.15) }]}>
      <Text style={[styles.badgeLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A wrapping row of badges or chips. */
export function Row({ children, gap = 6 }: { children: ReactNode; gap?: number }) {
  return <View style={[styles.wrapRow, { gap }]}>{children}</View>;
}

/** The web's `<Alert variant="light">`: a tinted box that says something happened. */
export function Notice({
  tone = 'accent',
  title,
  children,
  onClose,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const palette = usePalette();
  const color = toneColor(tone, palette);
  return (
    <Pressable
      disabled={onClose === undefined}
      onPress={onClose}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: tint(color, 0.12), borderColor: tint(color, 0.4) }]}
    >
      {title === undefined ? null : (
        <Text style={[styles.heading, { color: palette.text }]}>{title}</Text>
      )}
      {typeof children === 'string' ? (
        <Text style={[styles.body, { color: palette.text }]}>{children}</Text>
      ) : (
        children
      )}
      {onClose === undefined ? null : (
        <Text style={[styles.small, { color: palette.dimmed }]}>Tap to dismiss</Text>
      )}
    </Pressable>
  );
}

/** The web's `SegmentedControl`: one of a few, all on screen. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Names the control for screen readers. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const palette = usePalette();
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="tablist"
      style={[
        styles.segmented,
        { backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              onChange(option.value);
            }}
            style={[styles.segment, selected && { backgroundColor: palette.surface }]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentLabel,
                { color: selected ? palette.text : palette.dimmed },
                selected && styles.segmentSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The web's `Switch` with a label and description. */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const palette = usePalette();
  // The whole row toggles, as a web label does: the words are the bigger
  // target, and one control is one thing for a screen reader to announce.
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        onChange(!value);
      }}
      style={styles.switchRow}
    >
      <View style={styles.grow}>
        <Text style={[styles.body, { color: palette.text }]}>{label}</Text>
        {description === undefined ? null : (
          <Text style={[styles.small, { color: palette.dimmed }]}>{description}</Text>
        )}
      </View>
      <Switch
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.accent, false: palette.border }}
        thumbColor="#ffffff"
      />
    </Pressable>
  );
}

/** Goes back, or to `fallback` when this screen was opened by a link. */
export function goBack(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * The web's `BackArrow`: ← beside a screen's title. Every back on the phone
 * is this one control, as on the web, so none reads "‹ Back" and another "‹".
 */
export function BackArrow({
  fallback,
  label = 'Back',
}: {
  fallback: Href;
  /** For screen readers: "Back to workouts". */
  label?: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      onPress={() => {
        goBack(fallback);
      }}
      style={({ pressed }) => [styles.backArrow, pressed && styles.pressed]}
    >
      <Text style={[styles.backGlyph, { color: palette.text }]}>←</Text>
    </Pressable>
  );
}

/** The web's `BackTitle`: a back arrow, then the screen's name. */
export function BackTitle({ title, fallback }: { title: string; fallback: Href }) {
  return (
    <View style={styles.backTitle}>
      <BackArrow fallback={fallback} />
      <View style={styles.grow}>
        <Title>{title}</Title>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  heading: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 6 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  // 48 high: the thumb-sized touch target the web theme's `md` buttons aim for.
  button: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  buttonCompact: {
    minHeight: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonLabelCompact: { fontSize: 14, fontWeight: '600' },
  field: { gap: 4 },
  label: { fontSize: 13 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  notice: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 34,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentLabel: { fontSize: 13, fontWeight: '500' },
  segmentSelected: { fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  backTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 22 },
});
