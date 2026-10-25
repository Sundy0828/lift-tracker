import type { Session } from '@lift/domain/sessions';
import { addDays, formatDayLabel } from '@lift/domain/history';
import { localDateKey } from '@lift/domain/sessions';
import type { Unit, Weight } from '@lift/domain/types';
import { convertForInput, formatNumber } from '@lift/domain/units';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { Field } from '../ui';

/**
 * The session's own fields: the day it counts as, bodyweight and notes.
 *
 * Folded away, as on the web: `performedOn` is stamped automatically and
 * nobody should answer a question before they can start lifting. Each field
 * writes when editing ends.
 *
 * The day is a stepper rather than a typed date: a session is filed under
 * today or a day or two back, never next week, and a picker would be one more
 * native module for that.
 */

type Props = {
  session: Session;
  displayUnit: Unit;
  onPerformedOn: (performedOn: string) => void;
  onBodyweight: (bodyweight: Weight | null) => void;
  onNotes: (notes: string) => void;
};

export function SessionMeta({ session, displayUnit, onPerformedOn, onBodyweight, onNotes }: Props) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);

  // Shown in the display unit, stored as entered (§2.7).
  const shown =
    session.bodyweight === null ? null : convertForInput(session.bodyweight, displayUnit);
  const storedBodyweight = shown === null ? '' : formatNumber(shown.value);
  const [bodyweight, setBodyweight] = useState(storedBodyweight);
  const [notes, setNotes] = useState(session.notes);

  // A change from another device (or a unit switch) replaces the text, as
  // React's "adjust state while rendering" pattern: no effect, no extra pass.
  const [seen, setSeen] = useState({ bodyweight: storedBodyweight, notes: session.notes });
  if (seen.bodyweight !== storedBodyweight || seen.notes !== session.notes) {
    if (seen.bodyweight !== storedBodyweight) setBodyweight(storedBodyweight);
    if (seen.notes !== session.notes) setNotes(session.notes);
    setSeen({ bodyweight: storedBodyweight, notes: session.notes });
  }

  const today = localDateKey();
  const earlier = addDays(session.performedOn, -1);
  const later = addDays(session.performedOn, 1);

  return (
    <View style={[styles.card, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen((current) => !current);
        }}
        style={styles.header}
      >
        <Text style={[styles.title, { color: palette.text }]}>Session details</Text>
        <Text style={[styles.summary, { color: palette.dimmed }]}>
          {session.performedOn === localDateKey() ? 'today' : session.performedOn}
          {shown === null ? '' : ` · ${formatNumber(shown.value)} ${displayUnit}`}
          {open ? '  ▴' : '  ▾'}
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <Field
            label={`Bodyweight (${displayUnit}), optional`}
            keyboardType="decimal-pad"
            value={bodyweight}
            onChangeText={setBodyweight}
            onEndEditing={() => {
              const raw = bodyweight.trim().replace(',', '.');
              if (raw === '') {
                onBodyweight(null);
                return;
              }
              const value = Number(raw);
              if (Number.isFinite(value) && value > 0) onBodyweight({ value, unit: displayUnit });
            }}
          />
          <View style={styles.dateRow}>
            <Text style={[styles.summary, { color: palette.dimmed }]}>Performed on</Text>
            <View style={styles.stepper}>
              <DayStep
                label="A day earlier"
                glyph="‹"
                disabled={earlier === null}
                onPress={() => {
                  if (earlier !== null) onPerformedOn(earlier);
                }}
              />
              <Text style={[styles.date, { color: palette.text }]}>
                {formatDayLabel(session.performedOn)}
              </Text>
              {/* Never past today: a session cannot have happened tomorrow. */}
              <DayStep
                label="A day later"
                glyph="›"
                disabled={later === null || later > today}
                onPress={() => {
                  if (later !== null && later <= today) onPerformedOn(later);
                }}
              />
            </View>
          </View>
          <Field
            label="Session notes"
            multiline
            value={notes}
            placeholder="Slept badly, gym was busy, …"
            onChangeText={setNotes}
            onEndEditing={() => {
              if (notes !== session.notes) onNotes(notes);
            }}
            style={styles.notes}
          />
        </View>
      ) : null}
    </View>
  );
}

function DayStep({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={[styles.dayStep, { borderColor: palette.border }, disabled && styles.disabled]}
    >
      <Text style={[styles.dayGlyph, { color: palette.text }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 8 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  title: { fontSize: 15, fontWeight: '600' },
  summary: { fontSize: 12 },
  body: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { fontSize: 14, fontWeight: '600', minWidth: 96, textAlign: 'center' },
  dayStep: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayGlyph: { fontSize: 20, lineHeight: 22 },
  disabled: { opacity: 0.35 },
  notes: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' },
});
