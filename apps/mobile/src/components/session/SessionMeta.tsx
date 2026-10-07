import type { Session } from '@lift/domain/sessions';
import { isDateKey, localDateKey } from '@lift/domain/sessions';
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
  const [bodyweight, setBodyweight] = useState(shown === null ? '' : formatNumber(shown.value));
  const [date, setDate] = useState(session.performedOn);
  const [notes, setNotes] = useState(session.notes);
  const [dateError, setDateError] = useState(false);

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
          <Field
            label="Performed on (YYYY-MM-DD)"
            value={date}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setDate}
            onEndEditing={() => {
              // Only a real calendar date: a half-typed one would file the
              // session under a day that does not exist.
              const ok = isDateKey(date);
              setDateError(!ok);
              if (ok && date !== session.performedOn) onPerformedOn(date);
            }}
          />
          {dateError ? (
            <Text style={[styles.summary, { color: palette.warn }]}>
              Not a date. Use the form 2026-10-06.
            </Text>
          ) : null}
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

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    minHeight: 48,
  },
  title: { fontSize: 15, fontWeight: '600' },
  summary: { fontSize: 13 },
  body: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  notes: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' },
});
