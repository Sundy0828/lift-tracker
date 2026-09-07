import { ActionIcon, Group, NumberInput, Text, Tooltip } from '@mantine/core';
import type { ExerciseSlot, WorkoutBody } from '@/domain/workouts';
import {
  MAX_SETS,
  formatPrescription,
  formatRestSeconds,
  groupRounds,
  restSlotSeconds,
} from '@/domain/workouts';
import { SortableList, SortableRow } from './SortableList';
import { SwipeRow, type SwipeAction } from './SwipeRow';
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
 * Joining a circuit is the drag gesture — hold a row over another — and there
 * is no button for it. Leaving has two routes, because drag alone is not
 * enough: dragging a member clear of the block works when there is somewhere
 * clear to go, and **swiping the row right** works always, including the case
 * that has no outside at all (a two-exercise workout that is entirely one
 * circuit).
 */

type Props = {
  workout: WorkoutBody;
  defaultRestSeconds: number;
  onReorder: (from: number, to: number) => void;
  onEditSlot: (slot: ExerciseSlot) => void;
  onRemoveSlot: (slotId: string) => void;
  onGroup: (activeSlotId: string, targetSlotId: string) => void;
  /** Takes one slot out of its circuit, dissolving a group left with one. */
  onLeaveCircuit: (slotId: string) => void;
  /**
   * Opens the picker to insert after this slot; null for the start.
   *
   * `join` is false for the insert row *below* a circuit block, which places
   * the new slot after the block rather than inside it.
   */
  onAddAfter: (slotId: string | null, join: boolean) => void;
  /** Inserts a rest row after this slot; null for the start. */
  onAddRestAfter: (slotId: string | null, join: boolean) => void;
  onRounds: (groupId: string, rounds: number) => void;
  onGroupRest: (groupId: string, seconds: number | null) => void;
  onRestSeconds: (slotId: string, seconds: number) => void;
};

/** Consecutive runs of slots, split by superset group. */
type Segment =
  | { kind: 'single'; slot: ExerciseSlot; index: number }
  | { kind: 'circuit'; groupId: string; members: { slot: ExerciseSlot; index: number }[] };

function segment(slots: readonly ExerciseSlot[]): Segment[] {
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
function formatReps(slot: ExerciseSlot): string {
  const { min, max } = slot.prescription.repRange;
  return min === max ? `${String(min)} reps` : `${String(min)}-${String(max)} reps`;
}

function SlotBody({
  slot,
  inCircuit,
  onEditSlot,
  onRestSeconds,
}: {
  slot: ExerciseSlot;
  inCircuit: boolean;
  onEditSlot: (slot: ExerciseSlot) => void;
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

function RemoveButton({
  slot,
  onRemoveSlot,
}: {
  slot: ExerciseSlot;
  onRemoveSlot: (slotId: string) => void;
}) {
  const label = slot.kind === 'rest' ? 'rest' : slot.exerciseName;
  return (
    <Tooltip label={`Delete ${label}`} withArrow>
      <ActionIcon
        variant="subtle"
        color="red"
        size="md"
        aria-label={`Delete ${label}`}
        onClick={() => {
          onRemoveSlot(slot.slotId);
        }}
      >
        ✕
      </ActionIcon>
    </Tooltip>
  );
}

/**
 * The insertion point between rows: its own row rather than a control on an
 * exercise, because it acts on the gap.
 *
 * One sits above the first exercise, which is the only way to add something at
 * the top — and the only control an empty workout needs. One sits below a
 * circuit block too, with `join` false: every insertion point *inside* a block
 * joins the circuit, so without it a circuit at the end of a workout could
 * only ever grow.
 */
function InsertRow({
  slotId,
  where,
  join = true,
  onAddAfter,
  onAddRestAfter,
}: {
  /** null for the row above the first exercise, i.e. the start. */
  slotId: string | null;
  /** Completes "Add an exercise …", e.g. "after Pushups". */
  where: string;
  join?: boolean;
  onAddAfter: (slotId: string | null, join: boolean) => void;
  onAddRestAfter: (slotId: string | null, join: boolean) => void;
}) {
  return (
    <div className={classes.insertRow}>
      <span className={classes.insertRule} aria-hidden="true" />
      <Tooltip label={`Add an exercise ${where}`} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          data-testid="insert-exercise"
          aria-label={`Add an exercise ${where}`}
          onClick={() => {
            onAddAfter(slotId, join);
          }}
        >
          ＋
        </ActionIcon>
      </Tooltip>
      <Tooltip label={`Add a rest ${where}`} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          data-testid="insert-rest"
          aria-label={`Add a rest ${where}`}
          onClick={() => {
            onAddRestAfter(slotId, join);
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
  onRemoveSlot,
  onGroup,
  onLeaveCircuit,
  onAddAfter,
  onAddRestAfter,
  onRounds,
  onGroupRest,
  onRestSeconds,
}: Props) {
  const slotIds = workout.slots.map((slot) => slot.slotId);
  const segments = segment(workout.slots);

  const nameOf = (slot: ExerciseSlot): string =>
    slot.kind === 'rest' ? 'rest' : slot.exerciseName;

  /** Swipe left deletes; swipe right leaves the circuit, when in one. */
  const swipeActions = (slot: ExerciseSlot, inCircuit: boolean) => {
    const left: SwipeAction = {
      label: `Delete ${nameOf(slot)}`,
      tone: 'danger',
      onCommit: () => {
        onRemoveSlot(slot.slotId);
      },
    };
    if (!inCircuit) return { left };
    return {
      left,
      right: {
        label: 'Leave circuit',
        tone: 'neutral',
        onCommit: () => {
          onLeaveCircuit(slot.slotId);
        },
      } satisfies SwipeAction,
    };
  };

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
      <InsertRow
        slotId={null}
        where="at the start"
        onAddAfter={onAddAfter}
        onAddRestAfter={onAddRestAfter}
      />

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
                extraControls={<RemoveButton slot={slot} onRemoveSlot={onRemoveSlot} />}
                surface={(rowContent) => (
                  <SwipeRow {...swipeActions(slot, false)}>{rowContent}</SwipeRow>
                )}
              >
                <SlotBody
                  slot={slot}
                  inCircuit={false}
                  onEditSlot={onEditSlot}
                  onRestSeconds={onRestSeconds}
                />
              </SortableRow>
              <InsertRow
                slotId={slot.slotId}
                where={`after ${nameOf(slot)}`}
                onAddAfter={onAddAfter}
                onAddRestAfter={onAddRestAfter}
              />
            </div>
          );
        }

        const rounds = groupRounds(item.members.map((member) => member.slot));
        const roundRest = workout.groupRest[item.groupId] ?? null;
        const lead = item.members[0]?.slot.exerciseName ?? '';
        const exerciseCount = item.members.filter(({ slot }) => slot.kind === 'exercise').length;

        const last = item.members.at(-1)?.slot;

        return (
          <div key={item.groupId}>
            <div className={classes.circuit} data-testid="circuit-block">
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
                      round rest
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
                    extraControls={<RemoveButton slot={slot} onRemoveSlot={onRemoveSlot} />}
                    surface={(rowContent) => (
                      <SwipeRow {...swipeActions(slot, true)}>{rowContent}</SwipeRow>
                    )}
                  >
                    <SlotBody
                      slot={slot}
                      inCircuit
                      onEditSlot={onEditSlot}
                      onRestSeconds={onRestSeconds}
                    />
                  </SortableRow>
                  <InsertRow
                    slotId={slot.slotId}
                    where={`after ${nameOf(slot)}, in the circuit`}
                    onAddAfter={onAddAfter}
                    onAddRestAfter={onAddRestAfter}
                  />
                </div>
              ))}

              <Text size="xs" c="dimmed" className={classes.circuitFoot}>
                {rounds === null
                  ? 'Members have different set counts — set the rounds to line them up.'
                  : `${String(rounds)} rounds of these ${String(exerciseCount)}, in order.`}
              </Text>
            </div>

            {/* Outside the block, and `join` false: this is how a workout that
                ends in a circuit gets anything after it. */}
            {last === undefined ? null : (
              <InsertRow
                slotId={last.slotId}
                where="after the circuit"
                join={false}
                onAddAfter={onAddAfter}
                onAddRestAfter={onAddRestAfter}
              />
            )}
          </div>
        );
      })}
    </SortableList>
  );
}
