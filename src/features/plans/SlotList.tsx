import { ActionIcon, Group, NumberInput, Text, Tooltip } from '@mantine/core';
import type { PlanExerciseSlot, PlanWorkout } from '@/domain/plans';
import {
  MAX_SETS,
  formatPrescription,
  formatRestSeconds,
  groupRounds,
  restSlotSeconds,
} from '@/domain/plans';
import { SortableList, SortableRow } from './SortableList';
import classes from './SlotList.module.css';

/**
 * The exercise list for one workout, with contiguous superset groups drawn as
 * a single circuit block.
 *
 * A circuit's set count *is* its round count, so the block owns one Rounds
 * control that writes to every member. Pauses inside a round are **rest rows**
 * you place between exercises, which reads the way the workout runs — 400,
 * rest, 800, rest — rather than hiding a number on the exercise before it.
 * The block's own rest is the pause after a whole round.
 *
 * Grouping and ungrouping are both the drag gesture, so there is no button for
 * either: hold a row over another to join it, drag one clear of the block to
 * leave.
 */

type Props = {
  workout: PlanWorkout;
  defaultRestSeconds: number;
  onReorder: (from: number, to: number) => void;
  onEditSlot: (slot: PlanExerciseSlot) => void;
  onGroup: (activeSlotId: string, targetSlotId: string) => void;
  /** Opens the picker to insert directly after this slot. */
  onAddAfter: (slotId: string) => void;
  /** Inserts a rest row directly after this slot. */
  onAddRestAfter: (slotId: string) => void;
  onRounds: (groupId: string, rounds: number) => void;
  onGroupRest: (groupId: string, seconds: number | null) => void;
  onRestSeconds: (slotId: string, seconds: number) => void;
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

/** Reps only — inside a circuit the set count belongs to the block. */
function formatReps(slot: PlanExerciseSlot): string {
  const { min, max } = slot.prescription.repRange;
  return min === max ? `${String(min)} reps` : `${String(min)}-${String(max)} reps`;
}

function SlotBody({
  slot,
  inCircuit,
  onEditSlot,
  onRestSeconds,
}: {
  slot: PlanExerciseSlot;
  inCircuit: boolean;
  onEditSlot: (slot: PlanExerciseSlot) => void;
  onRestSeconds: (slotId: string, seconds: number) => void;
}) {
  if (slot.kind === 'rest') {
    return (
      <Group gap={8} wrap="nowrap">
        <Text size="sm" fw={550} c="dimmed">
          Rest
        </Text>
        <NumberInput
          size="xs"
          w={92}
          min={0}
          max={3600}
          step={15}
          allowDecimal={false}
          suffix="s"
          aria-label="Rest length"
          value={restSlotSeconds(slot)}
          onChange={(value) => {
            if (typeof value === 'number') onRestSeconds(slot.slotId, value);
          }}
        />
      </Group>
    );
  }

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
        {inCircuit ? formatReps(slot) : formatPrescription(slot.prescription)}
      </Text>
    </button>
  );
}

/**
 * The insertion point below a row: its own row rather than a control on the
 * exercise, because it acts on the gap, not on the exercise above it.
 */
function InsertRow({
  slot,
  onAddAfter,
  onAddRestAfter,
}: {
  slot: PlanExerciseSlot;
  onAddAfter: (slotId: string) => void;
  onAddRestAfter: (slotId: string) => void;
}) {
  return (
    <div className={classes.insertRow}>
      <span className={classes.insertRule} aria-hidden="true" />
      <Tooltip label={`Add an exercise after ${slot.exerciseName}`} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={`Add an exercise after ${slot.exerciseName}`}
          onClick={() => {
            onAddAfter(slot.slotId);
          }}
        >
          ＋
        </ActionIcon>
      </Tooltip>
      <Tooltip label={`Add a rest after ${slot.exerciseName}`} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={`Add a rest after ${slot.exerciseName}`}
          onClick={() => {
            onAddRestAfter(slot.slotId);
          }}
        >
          ⏱
        </ActionIcon>
      </Tooltip>
      <span className={classes.insertRule} aria-hidden="true" />
    </div>
  );
}

export function SlotList({
  workout,
  defaultRestSeconds,
  onReorder,
  onEditSlot,
  onGroup,
  onAddAfter,
  onAddRestAfter,
  onRounds,
  onGroupRest,
  onRestSeconds,
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
            <div key={slot.slotId}>
              <SortableRow
                id={slot.slotId}
                index={index}
                total={workout.slots.length}
                label={slot.exerciseName}
                onMove={onReorder}
              >
                <SlotBody
                  slot={slot}
                  inCircuit={false}
                  onEditSlot={onEditSlot}
                  onRestSeconds={onRestSeconds}
                />
              </SortableRow>
              <InsertRow slot={slot} onAddAfter={onAddAfter} onAddRestAfter={onAddRestAfter} />
            </div>
          );
        }

        const rounds = groupRounds(item.members.map((member) => member.slot));
        const roundRest = workout.groupRest[item.groupId] ?? null;
        const lead = item.members[0]?.slot.exerciseName ?? '';
        const exerciseCount = item.members.filter(({ slot }) => slot.kind === 'exercise').length;

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
                  aria-label={`Rounds for the circuit starting with ${lead}`}
                  value={rounds ?? ''}
                  placeholder="mixed"
                  onChange={(value) => {
                    if (typeof value === 'number') onRounds(item.groupId, value);
                  }}
                />
              </Group>
              <Group gap={4} wrap="nowrap">
                <Tooltip label="Pause after a whole round, on top of any rest rows" withArrow>
                  <Text size="xs" c="dimmed" className={classes.roundRestLabel}>
                    rest between rounds
                  </Text>
                </Tooltip>
                <NumberInput
                  size="xs"
                  w={92}
                  min={0}
                  max={3600}
                  step={15}
                  allowDecimal={false}
                  suffix="s"
                  aria-label={`Rest between rounds for the circuit starting with ${lead}`}
                  placeholder={formatRestSeconds(defaultRestSeconds)}
                  value={roundRest ?? ''}
                  onChange={(value) => {
                    onGroupRest(item.groupId, typeof value === 'number' ? value : null);
                  }}
                />
              </Group>
            </Group>

            {item.members.map(({ slot, index }) => (
              <div key={slot.slotId}>
                <SortableRow
                  id={slot.slotId}
                  index={index}
                  total={workout.slots.length}
                  label={slot.exerciseName}
                  onMove={onReorder}
                >
                  <SlotBody
                    slot={slot}
                    inCircuit
                    onEditSlot={onEditSlot}
                    onRestSeconds={onRestSeconds}
                  />
                </SortableRow>
                <InsertRow slot={slot} onAddAfter={onAddAfter} onAddRestAfter={onAddRestAfter} />
              </div>
            ))}

            <Text size="xs" c="dimmed" className={classes.circuitFoot}>
              {rounds === null
                ? 'Members have different set counts — set the rounds to line them up.'
                : `${String(rounds)} rounds of these ${String(exerciseCount)}, in order.`}
            </Text>
          </div>
        );
      })}
    </SortableList>
  );
}
