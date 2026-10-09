import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform as OS,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette } from '../../theme';

/**
 * The editor's controls. Thumb-sized throughout: the editor is used standing
 * up between sets as often as on the sofa.
 */

/** A pill that is on or off: a rest preset, a filter, a muscle. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: palette.accent, borderColor: palette.accent }
          : { borderColor: palette.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? palette.onAccent : palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  disabled,
  compact,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      // The compact button is drawn small, as the web's xs inputs are, but
      // still answers a thumb-sized touch.
      hitSlop={compact ? 8 : 0}
      style={({ pressed }) => [
        compact ? styles.stepCompact : styles.step,
        { borderColor: palette.border },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[compact ? styles.stepLabelCompact : styles.stepLabel, { color: palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * − value +. Steppers rather than typed numbers: every value here is small
 * and moves by one (or by 15 s), and a number pad covers half the sheet.
 */
export function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
  size = 'md',
}: {
  /** Names the quantity for screen readers, e.g. "Sets". */
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  /** `compact` for inline use, like the circuit card's header. */
  size?: 'md' | 'compact';
}) {
  const palette = usePalette();
  const compact = size === 'compact';
  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      <StepButton
        label="−"
        accessibilityLabel={`Less ${label.toLowerCase()}`}
        disabled={!canDecrement}
        compact={compact}
        onPress={onDecrement}
      />
      <Text
        style={[compact ? styles.stepValueCompact : styles.stepValue, { color: palette.text }]}
        accessibilityLabel={`${label}: ${value}`}
      >
        {value}
      </Text>
      <StepButton
        label="+"
        accessibilityLabel={`More ${label.toLowerCase()}`}
        disabled={!canIncrement}
        compact={compact}
        onPress={onIncrement}
      />
    </View>
  );
}

/** A labelled row: the name on the left, its control on the right. */
export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldText}>
        <Text style={[styles.fieldLabel, { color: palette.text }]}>{label}</Text>
        {hint === undefined ? null : (
          <Text style={[styles.hint, { color: palette.dimmed }]}>{hint}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

/** A card whose body folds away: notes, version history, the danger zone. */
export function Section({
  title,
  summary,
  initiallyOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View
      style={[styles.section, { borderColor: palette.border, backgroundColor: palette.surface }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen((current) => !current);
        }}
        style={styles.sectionHeader}
      >
        <Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.hint, { color: palette.dimmed }]}>
          {summary ?? ''}
          {open ? '  ▴' : '  ▾'}
        </Text>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/**
 * A full-height sheet with a title bar, sliding up over the editor.
 *
 * A screen-sized modal rather than a half sheet: the prescription editor and
 * the picker both hold more than half a phone, and a keyboard takes the rest.
 */
export function Sheet({
  visible,
  title,
  onClose,
  headerAction,
  footer,
  scroll = true,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** A button at the right of the title bar, e.g. "New". */
  headerAction?: ReactNode;
  /** Pinned under the content: Save and Cancel. */
  footer?: ReactNode;
  /** False when the body is its own list, which must not nest in a ScrollView. */
  scroll?: boolean;
  children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={OS.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaView
        edges={OS.OS === 'ios' ? ['bottom'] : ['top', 'bottom']}
        style={[styles.root, { backgroundColor: palette.background }]}
      >
        <View style={[styles.sheetHeader, { borderBottomColor: palette.border }]}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
            <Text style={[styles.link, { color: palette.dimmed }]}>Close</Text>
          </Pressable>
          <Text style={[styles.sheetTitle, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.headerAction}>{headerAction}</View>
        </View>
        <KeyboardAvoidingView
          style={styles.root}
          behavior={OS.OS === 'ios' ? 'padding' : undefined}
        >
          {scroll ? (
            <ScrollView
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.root, styles.sheetBodyFlat]}>{children}</View>
          )}
          {footer === undefined ? null : (
            <View style={[styles.footer, { borderTopColor: palette.border }]}>{footer}</View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/** A small text button: "Use my default", "Hide". */
export function LinkButton({
  label,
  onPress,
  tone = 'dimmed',
}: {
  label: string;
  onPress: () => void;
  tone?: 'dimmed' | 'accent' | 'danger';
}) {
  const palette = usePalette();
  const color =
    tone === 'accent' ? palette.accent : tone === 'danger' ? palette.danger : palette.dimmed;
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
      <Text style={[styles.link, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  chip: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontSize: 22, fontWeight: '600' },
  stepperCompact: { gap: 4 },
  stepCompact: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabelCompact: { fontSize: 16, fontWeight: '600' },
  stepValueCompact: { minWidth: 32, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  stepValue: { minWidth: 64, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldText: { flex: 1, gap: 2 },
  fieldLabel: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13 },
  section: { borderWidth: 1, borderRadius: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  sectionBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  // Balances the Close link so the title stays centred.
  headerAction: { minWidth: 44, alignItems: 'flex-end' },
  sheetBody: { padding: 16, gap: 16, paddingBottom: 32 },
  sheetBodyFlat: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  link: { fontSize: 15, fontWeight: '600' },
});
