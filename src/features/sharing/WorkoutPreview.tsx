import { Badge, Card, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import type { WorkoutBody } from '@/domain/workouts';
import {
  exerciseSlots,
  formatPrescription,
  formatRestSeconds,
  isRestSlot,
  restSlotSeconds,
  totalSets,
} from '@/domain/workouts';

/**
 * A shared workout, read-only.
 *
 * Deliberately not `SlotList`: that component is the editor — drag handles,
 * swipe-to-delete, prescription sheets — and none of it applies to somebody
 * else's snapshot. Reusing it would mean threading a `readOnly` flag through
 * every interaction in it, which is a worse trade than forty lines of plain
 * rendering.
 *
 * Exercise names come from the snapshot's own `exerciseName`, not from a
 * lookup. That is what makes a share render at all: a recipient cannot resolve
 * the sender's custom-exercise ids, and the denormalised name is the point
 * (§2.9).
 *
 * `onShowExercise` makes each row tappable. The library passes it, because
 * every id there is a bundled catalog one and so always resolves; a share does
 * not, because a sender's custom exercise would open an empty panel.
 */
export function WorkoutPreview({
  body,
  onShowExercise,
}: {
  body: WorkoutBody;
  onShowExercise?: ((exerciseId: string) => void) | undefined;
}) {
  const exercises = exerciseSlots(body.slots);

  return (
    <Stack gap="xs">
      <Group gap={6}>
        <Badge size="xs" variant="light" color="gray">
          {exercises.length === 1 ? '1 exercise' : `${String(exercises.length)} exercises`}
        </Badge>
        <Badge size="xs" variant="light" color="gray">
          {totalSets(body)} sets
        </Badge>
      </Group>

      {body.slots.length === 0 ? (
        <Text size="sm" c="dimmed">
          This workout has no exercises in it.
        </Text>
      ) : null}

      {body.slots.map((slot) =>
        isRestSlot(slot) ? (
          <Text key={slot.slotId} size="xs" c="dimmed" ta="center">
            rest {formatRestSeconds(restSlotSeconds(slot))}
          </Text>
        ) : (
          <Card key={slot.slotId} withBorder padding="xs">
            <Stack gap={2}>
              <Group gap="xs" wrap="nowrap" justify="space-between">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate style={{ minWidth: 0 }}>
                    {slot.exerciseName}
                  </Text>
                  {slot.supersetGroup === null ? null : (
                    <Badge size="xs" variant="light" color="sky">
                      circuit
                    </Badge>
                  )}
                </Group>
                {onShowExercise === undefined ? null : (
                  <UnstyledButton
                    aria-label={`How to do ${slot.exerciseName}`}
                    data-testid="preview-how-to"
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      onShowExercise(slot.exerciseId);
                    }}
                  >
                    <Badge size="xs" variant="light" color="gray" style={{ cursor: 'pointer' }}>
                      How to
                    </Badge>
                  </UnstyledButton>
                )}
              </Group>
              <Text size="xs" c="dimmed">
                {formatPrescription(slot.prescription)}
              </Text>
              {slot.prescription.loadHint === null ? null : (
                <Text size="xs" c="dimmed">
                  {slot.prescription.loadHint}
                </Text>
              )}
              {slot.notes === '' ? null : (
                <Text size="xs" c="dimmed" fs="italic">
                  {slot.notes}
                </Text>
              )}
            </Stack>
          </Card>
        ),
      )}
    </Stack>
  );
}
