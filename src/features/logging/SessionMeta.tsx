import { Accordion, Group, Text, TextInput, Textarea } from '@mantine/core';
import { useState } from 'react';
import type { Session } from '@/domain/sessions';
import { isDateKey, localDateKey } from '@/domain/sessions';
import type { Unit, Weight } from '@/domain/types';
import { convertForInput, formatNumber } from '@/domain/units';

/**
 * The session's own fields: the date it counts as, bodyweight, and notes.
 *
 * Folded away by default. `performedOn` is stamped automatically from the
 * local date and is editable but never required — a workout logged the next
 * morning belongs to the night before, and nobody should have to answer a
 * date question before they can start lifting.
 */

type Props = {
  session: Session;
  displayUnit: Unit;
  onPerformedOn: (performedOn: string) => void;
  onBodyweight: (bodyweight: Weight | null) => void;
  onNotes: (notes: string) => void;
};

export function SessionMeta({ session, displayUnit, onPerformedOn, onBodyweight, onNotes }: Props) {
  const [notes, setNotes] = useState<string | null>(null);

  // Prefilled in the display unit, but stored as entered (§2.7), so switching
  // to kg never rewrites a bodyweight recorded in lb.
  const shown =
    session.bodyweight === null ? null : convertForInput(session.bodyweight, displayUnit);

  return (
    <Accordion variant="separated">
      <Accordion.Item value="details">
        <Accordion.Control>
          <Group gap="xs">
            <Text size="sm">Session details</Text>
            <Text size="xs" c="dimmed">
              {session.performedOn === localDateKey() ? 'today' : session.performedOn}
              {shown === null ? '' : ` · ${formatNumber(shown.value)} ${displayUnit}`}
            </Text>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Group grow align="flex-start" wrap="wrap">
            <TextInput
              type="date"
              label="Performed on"
              description="Stamped automatically; change it if you are logging a past session."
              value={session.performedOn}
              onChange={(event) => {
                // A half-typed date — the native input reports one per
                // keystroke when it is typed rather than picked — would file
                // the session under a day that does not exist, so only a real
                // calendar date is accepted.
                const next = event.currentTarget.value;
                if (isDateKey(next)) onPerformedOn(next);
              }}
            />
            <TextInput
              label={`Bodyweight (${displayUnit})`}
              description="Optional."
              inputMode="decimal"
              defaultValue={shown === null ? '' : formatNumber(shown.value)}
              onBlur={(event) => {
                const raw = event.currentTarget.value.trim().replace(',', '.');
                if (raw === '') {
                  onBodyweight(null);
                  return;
                }
                const value = Number(raw);
                if (Number.isFinite(value) && value > 0) {
                  onBodyweight({ value, unit: displayUnit });
                }
              }}
            />
          </Group>

          <Textarea
            mt="sm"
            label="Session notes"
            autosize
            minRows={2}
            placeholder="Slept badly, gym was busy, …"
            value={notes ?? session.notes}
            onChange={(event) => {
              setNotes(event.currentTarget.value);
            }}
            onBlur={() => {
              if (notes !== null && notes !== session.notes) onNotes(notes);
              setNotes(null);
            }}
          />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
