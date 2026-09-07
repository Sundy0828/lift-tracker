import { ActionIcon, Group, NumberInput, Text, Tooltip } from '@mantine/core';
import type { PlanExerciseSlot, PlanWorkout } from '@/domain/plans';
import { MAX_SETS, formatPrescription, formatRestSeconds, groupRounds } from '@/domain/plans';
import { SortableList, SortableRow } from './SortableList';
import classes from './SlotList.module.css';

/**
 * The exercise list for one workout, with contiguous superset groups drawn as
 * a single circuit block.
 *
 * A circuit's set count *is* its round count, so the block owns one Rounds
 * control that writes to every member. Members' own rest is the pause between
 * exercises inside a round (0 by default, so the round flows); the block's
 * rest is the pause after a whole round.
 */

type Props = {
  workout: PlanWorkout;
  defaultRestSeconds: number;
  onReorder: (from: number, to: number) => void;
  onEditSlot: (slot: PlanExerciseSlot) => void;
  onGroup: (activeSlotId: string, targetSlotId: string) => void;
  onUnlink: (slotId: string) => void;
  /** Opens the picker to insert directly after this slot. */
  onAddAfter: (slotId: string) => void;
  /** Rest after this exercise, within a round. */
  onSlotRest: (slotId: string, seconds: number | null) => void;
  onRounds: (groupId: string, rounds: number) => void;
  onGroupRest: (groupId: string, seconds: number | null) => void;
};

/** Consecutive runs of slots, split by superset group. */
type Segment =
  | { kind: 'single'; slot: PlanExerciseSlot; index: number }
  | { kind: 'circuit'; groupId: string; members: { slot: PlanExerciseSlot; index: number }[] };

function segment(slots: readonly PlanExerciseSlot[]): Segment[] {
  const segments: Segment[] = [];

  slots.forEach((slot, index) => {
    const last = segments.at(-1);
    if (
      slot.supersetGroup !== null &&
      last?.kind === 'circuit' &&
      last.groupId === slot.supersetGroup
    ) {
      last.members.push({ slot, index });
      return;
    }
    if (slot.supersetGroup !== null) {
      segments.push({ kind: 'circuit', groupId: slot.supersetGroup, members: [{ slot, index }] });
      return;
    }
    segments.push({ kind: 'single', slot, index });
  });

  // A group of one is just an exercise.
  return segments.map((item) =>
    item.kind === 'circuit' && item.members.length === 1 && item.members[0] !== undefined
      ? { kind: 'single', slot: item.members[0].slot, index: item.members[0].index }
      : item,
  );
}

function AddAfterButton({
  slotId,
  label,
  onAddAfter,
}: {
  slotId: string;
  label: string;
  onAddAfter: (slotId: string) => void;
}) {
  return (
    <Tooltip label="Add an exercise after this one" withArrow>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="lg"
        aria-label={`Add an exercise after ${label}`}
        onClick={() => {
          onAddAfter(slotId);
        }}
      >
        ＋
      </ActionIcon>
    </Tooltip>
  );
}

function SlotButton({
  slot,
  inCircuit,
  onEditSlot,
}: {
  slot: PlanExerciseSlot;
  inCircuit: boolean;
  onEditSlot: (slot: PlanExerciseSlot) => void;
}) {
  return (
    <button
      type="button"
      className={classes.slotButton}
      onClick={() => {
        onEditSlot(slot);
      }}
    >
      <Text size="sm" fw={550} lineClamp={1} data-testid="slot-name">
        {slot.exerciseName}
        {slot.occurrenceIndex > 0 ? (
          <Text component="span" size="xs" c="dimmed">
            {' '}
            (again)
          </Text>
        ) : null}
      </Text>
      <Text size="xs" c="dimmed">
        {inCircuit
          ? `${formatRange(slot)} @ ${String(slot.prescription.rirRange.min)}-${String(slot.prescription.rirRange.max)} RIR`
          : formatPrescription(slot.prescription)}
      </Text>
    </button>
  );
}

/** Reps only — inside a circuit the set count belongs to the block. */
function formatRange(slot: PlanExerciseSlot): string {
  const { min, max } = slot.prescription.repRange;
  return min === max ? `${String(min)} reps` : `${String(min)}-${String(max)} reps`;
}

export function SlotList({
  workout,
  defaultRestSeconds,
  onReorder,
  onEditSlot,
  onGroup,
  onUnlink,
  onAddAfter,
  onSlotRest,
  onRounds,
  onGroupRest,
}: Props) {
  const slotIds = workout.slots.map((slot) => slot.slotId);
  const segments = segment(workout.slots);

  const groupOf = (slotId: string): string | null =>
    workout.slots.find((slot) => slot.slotId === slotId)?.supersetGroup ?? null;

  return (
    <SortableList
      ids={slotIds}
      onReorder={onReorder}
      onGroup={onGroup}
      // Two rows already in the same circuit have nothing to join, so no
      // intent is offered and the drag stays a plain reorder.
      canGroup={(activeId, targetId) => {
        const active = groupOf(activeId);
        return active === null || active !== groupOf(targetId);
      }}
    >
      {segments.map((item) => {
        if (item.kind === 'single') {
          const { slot, index } = item;
          return (
            <SortableRow
              key={slot.slotId}
              id={slot.slotId}
              index={index}
              total={workout.slots.length}
              label={slot.exerciseName}
              onMove={onReorder}
              extraControls={
                <AddAfterButton
                  slotId={slot.slotId}
                  label={slot.exerciseName}
                  onAddAfter={onAddAfter}
                />
              }
            >
              <SlotButton slot={slot} inCircuit={false} onEditSlot={onEditSlot} />
            </SortableRow>
          );
        }

        const rounds = groupRounds(item.members.map((member) => member.slot));
        const roundRest = workout.groupRest[item.groupId] ?? null;

        return (
          <div key={item.groupId} className={classes.circuit} data-testid="circuit-block">
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
              <Group gap={6} wrap="nowrap">
                <Text size="xs" fw={700} className={classes.circuitLabel}>
                  Circuit
                </Text>
                <NumberInput
                  size="xs"
                  w={72}
                  min={1}
                  max={MAX_SETS}
                  allowDecimal={false}
                  clampBehavior="strict"
                  suffix="x"
                  aria-label={`Rounds for the circuit starting with ${item.members[0]?.slot.exerciseName ?? ''}`}
                  value={rounds ?? ''}
                  placeholder="mixed"
                  onChange={(value) => {
                    if (typeof value === 'number') onRounds(item.groupId, value);
                  }}
                />
              </Group>
              <Group gap={4} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  rest between rounds
                </Text>
                <NumberInput
                  size="xs"
                  w={92}
                  min={0}
                  max={3600}
                  step={15}
                  allowDecimal={false}
                  suffix="s"
                  aria-label={`Rest between rounds for the circuit starting with ${item.members[0]?.slot.exerciseName ?? ''}`}
                  placeholder={formatRestSeconds(defaultRestSeconds)}
                  value={roundRest ?? ''}
                  onChange={(value) => {
                    onGroupRest(item.groupId, typeof value === 'number' ? value : null);
                  }}
                />
              </Group>
            </Group>

            {item.members.map(({ slot, index }) => (
              <SortableRow
                key={slot.slotId}
                id={slot.slotId}
                index={index}
                total={workout.slots.length}
                label={slot.exerciseName}
                onMove={onReorder}
                extraControls={
                  <>
                    <AddAfterButton
                      slotId={slot.slotId}
                      label={slot.exerciseName}
                      onAddAfter={onAddAfter}
                    />
                    <Tooltip label="Remove from the circuit" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        aria-label={`Remove ${slot.exerciseName} from the circuit`}
                        onClick={() => {
                          onUnlink(slot.slotId);
                        }}
                      >
                        ⊖
                      </ActionIcon>
                    </Tooltip>
                  </>
                }
              >
                <SlotButton slot={slot} inCircuit onEditSlot={onEditSlot} />
              </SortableRow>
            ))}

            {/* Rest after each exercise, so a round need not be evenly paced:
                a short pause after the 400 and a long one after the 2k. This
                is the only place these are shown, so the row above stays
                readable. */}
            <div className={classes.memberRests}>
              <Text size="xs" c="dimmed" className={classes.restsTitle}>
                rest inside a round
              </Text>
              {item.members.map(({ slot }) => (
                <Group key={slot.slotId} gap={4} wrap="nowrap">
                  <Text size="xs" c="dimmed" className={classes.restLabel}>
                    after {slot.exerciseName}
                  </Text>
                  <NumberInput
                    size="xs"
                    w={78}
                    min={0}
                    max={3600}
                    step={15}
                    allowDecimal={false}
                    suffix="s"
                    aria-label={`Rest after ${slot.exerciseName}`}
                    placeholder="0"
                    value={slot.prescription.restSeconds ?? ''}
                    onChange={(value) => {
                      onSlotRest(slot.slotId, typeof value === 'number' ? value : null);
                    }}
                  />
                </Group>
              ))}
            </div>

            <Text size="xs" c="dimmed" className={classes.circuitFoot}>
              {rounds === null
                ? 'Members have different set counts — set the rounds to line them up.'
                : `${String(rounds)} rounds of these ${String(item.members.length)}, in order.`}
            </Text>
          </div>
        );
      })}
    </SortableList>
  );
}
