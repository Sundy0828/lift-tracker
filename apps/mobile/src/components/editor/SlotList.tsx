import type { ExerciseSlot, SlotPlace } from '@lift/domain/workouts';
import {
  MAX_SETS,
  formatPrescription,
  formatRange,
  formatRestSeconds,
  groupRounds,
  restSlotSeconds,
} from '@lift/domain/workouts';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { usePalette } from '../../theme';
import { Stepper } from './controls';
import { LIFT_MS, useDragHandlers, useDragView, useGapRef, useRowRef } from './drag';

/**
 * The workout's slots: the web's `SlotList`, for a thumb.
 *
 * A circuit is a card with its members inside, and the card owns the rounds
 * and the rest between rounds, since a circuit's set count *is* its round
 * count. An insert row sits between every pair of slots, inside cards and
 * out, as on the web, plus one below each card that adds after it rather
 * than into it.
 *
 * Moving things is the drag (see ./drag): hold a row to lift it, drop it in a
 * gap to move it, hold it over another row to make a circuit, drop it outside
 * its card to leave. Swiping is the backup for the same things: left deletes,
 * right duplicates or joins or leaves a circuit.
 *
 * Nothing here may change size during a drag, because every position is
 * measured once, when the row lifts. Highlights and hints are therefore drawn
 * over the rows and inside the gaps' fixed height, never added below them.
 */

type Props = {
  slots: readonly ExerciseSlot[];
  groupRest: Readonly<Record<string, number | null>>;
  defaultRestSeconds: number;
  onEditSlot: (slot: ExerciseSlot) => void;
  onAdd: (place: SlotPlace) => void;
  onAddRest: (place: SlotPlace) => void;
  onRemoveSlot: (slotId: string) => void;
  onDuplicateSlot: (slotId: string) => void;
  onJoinAbove: (slotId: string) => void;
  onLeaveCircuit: (slotId: string, placeBefore: boolean) => void;
  onRounds: (groupId: string, rounds: number) => void;
  onGroupRest: (groupId: string, seconds: number | null) => void;
};

type RowActions = Pick<
  Props,
  'onEditSlot' | 'onRemoveSlot' | 'onDuplicateSlot' | 'onJoinAbove' | 'onLeaveCircuit'
>;

/** Consecutive runs of slots, split by circuit. A circuit of one is just a slot. */
type Segment =
  | { kind: 'single'; slot: ExerciseSlot }
  | { kind: 'circuit'; groupId: string; members: ExerciseSlot[] };

function segment(slots: readonly ExerciseSlot[]): Segment[] {
  const segments: Segment[] = [];
  for (const slot of slots) {
    const last = segments.at(-1);
    if (
      slot.supersetGroup !== null &&
      last?.kind === 'circuit' &&
      last.groupId === slot.supersetGroup
    ) {
      last.members.push(slot);
    } else if (slot.supersetGroup !== null) {
      segments.push({ kind: 'circuit', groupId: slot.supersetGroup, members: [slot] });
    } else {
      segments.push({ kind: 'single', slot });
    }
  }
  return segments.map((item) =>
    item.kind === 'circuit' && item.members.length === 1 && item.members[0] !== undefined
      ? { kind: 'single', slot: item.members[0] }
      : item,
  );
}

function firstSlotId(item: Segment | undefined): string | null {
  if (item === undefined) return null;
  return item.kind === 'single' ? item.slot.slotId : (item.members[0]?.slotId ?? null);
}

/** What a row shows: the name and its prescription, or a rest's length. Also the dragged copy. */
export function SlotFace({ slot, inCircuit }: { slot: ExerciseSlot; inCircuit: boolean }) {
  const palette = usePalette();
  return (
    <View
      style={[
        styles.row,
        slot.kind === 'rest'
          ? {
              borderColor: palette.border,
              borderStyle: 'dashed',
              backgroundColor: palette.background,
            }
          : { borderColor: palette.border, backgroundColor: palette.surface },
      ]}
    >
      <View style={styles.text}>
        {slot.kind === 'rest' ? (
          <Text style={[styles.name, styles.restName, { color: palette.dimmed }]}>
            Rest {formatRestSeconds(restSlotSeconds(slot))}
          </Text>
        ) : (
          <>
            <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
              {slot.exerciseName}
              {slot.occurrenceIndex > 0 ? (
                <Text style={[styles.small, { color: palette.dimmed }]}> (again)</Text>
              ) : null}
            </Text>
            <Text style={[styles.small, { color: palette.dimmed }]} numberOfLines={1}>
              {/* Inside a circuit the set count belongs to the card. */}
              {inCircuit
                ? `${formatRange(slot.prescription.repRange)} reps`
                : formatPrescription(slot.prescription)}
            </Text>
          </>
        )}
      </View>
      <Text style={[styles.grip, { color: palette.dimmed }]} accessibilityElementsHidden>
        ≡
      </Text>
    </View>
  );
}

/**
 * The swipe actions behind a row, invisible until the row moves.
 *
 * They sit under the row the whole time, and the row's rounded corners let
 * their edges show through at rest; fading them in with the swipe removes
 * that.
 */
function SwipeActions({
  translation,
  children,
}: {
  translation: SharedValue<number>;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({ opacity: translation.value === 0 ? 0 : 1 }));
  return <Animated.View style={[styles.actions, style]}>{children}</Animated.View>;
}

function SwipeButton({
  label,
  color,
  textColor,
  onPress,
}: {
  label: string;
  color: string;
  textColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: color },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

function SlotRow({
  slot,
  circuit,
  canJoinAbove,
  onEditSlot,
  onRemoveSlot,
  onDuplicateSlot,
  onJoinAbove,
  onLeaveCircuit,
}: {
  slot: ExerciseSlot;
  /** Set for a circuit member: whether it is the first, which decides where leaving puts it. */
  circuit: { first: boolean } | null;
  canJoinAbove: boolean;
} & RowActions) {
  const palette = usePalette();
  const drag = useDragView();
  const { begin, move, end } = useDragHandlers();
  const rowRef = useRowRef(slot.slotId);
  const label = slot.kind === 'rest' ? 'rest' : slot.exerciseName;

  // On the JS thread: the work per move is a few comparisons, and the
  // floating copy moves through a shared value rather than a render.
  const pan = usePanGesture({
    activateAfterLongPress: LIFT_MS,
    runOnJS: true,
    onActivate: (event) => {
      begin(slot.slotId, event.absoluteY, event.y);
    },
    onUpdate: (event) => {
      move(event.absoluteY);
    },
    onDeactivate: (event) => {
      end(event.canceled);
    },
  });

  const lifted = drag?.slotId === slot.slotId;
  const target = drag?.target;
  const grouping = target?.kind === 'group' && target.slotId === slot.slotId ? target : null;

  const renderLeft = (
    _progress: SharedValue<number>,
    translation: SharedValue<number>,
    methods: SwipeableMethods,
  ) => (
    <SwipeActions translation={translation}>
      <SwipeButton
        label="Duplicate"
        color={palette.syncing}
        textColor={palette.syncingText}
        onPress={() => {
          methods.close();
          onDuplicateSlot(slot.slotId);
        }}
      />
      {circuit !== null ? (
        <SwipeButton
          label="Leave circuit"
          color={palette.syncing}
          textColor={palette.syncingText}
          onPress={() => {
            methods.close();
            onLeaveCircuit(slot.slotId, circuit.first);
          }}
        />
      ) : canJoinAbove ? (
        <SwipeButton
          label="Circuit with above"
          color={palette.accent}
          textColor={palette.onAccent}
          onPress={() => {
            methods.close();
            onJoinAbove(slot.slotId);
          }}
        />
      ) : null}
    </SwipeActions>
  );

  const renderRight = (
    _progress: SharedValue<number>,
    translation: SharedValue<number>,
    methods: SwipeableMethods,
  ) => (
    <SwipeActions translation={translation}>
      <SwipeButton
        label="Delete"
        color={palette.danger}
        textColor="#ffffff"
        onPress={() => {
          methods.close();
          onRemoveSlot(slot.slotId);
        }}
      />
    </SwipeActions>
  );

  return (
    <ReanimatedSwipeable
      friction={1.5}
      overshootLeft={false}
      overshootRight={false}
      enabled={drag === null}
      renderLeftActions={renderLeft}
      renderRightActions={renderRight}
      containerStyle={styles.swipe}
    >
      <GestureDetector gesture={pan}>
        <View ref={rowRef} collapsable={false} style={lifted ? styles.lifted : null}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${label}`}
            accessibilityHint="Hold to drag it. Swipe left to delete, right for more."
            onPress={() => {
              onEditSlot(slot);
            }}
          >
            <SlotFace slot={slot} inCircuit={circuit !== null} />
          </Pressable>
          {grouping === null ? null : (
            // Over the row, not around it: a border would change its size.
            <View
              pointerEvents="none"
              style={[
                styles.outline,
                grouping.armed
                  ? { borderColor: palette.groupTargetBorder, backgroundColor: palette.groupTarget }
                  : [styles.outlinePending, { borderColor: palette.circuitBorder }],
              ]}
            >
              <Text
                style={[
                  styles.pill,
                  grouping.armed
                    ? { backgroundColor: palette.groupTargetBorder, color: palette.onAccent }
                    : { backgroundColor: palette.border, color: palette.dimmed },
                ]}
              >
                {grouping.armed ? 'Release to group' : 'Hold to group'}
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>
    </ReanimatedSwipeable>
  );
}

/**
 * A gap between slots: a drop target during a drag and, unless `dropOnly`,
 * the insert row with + Exercise and + Rest.
 */
function Gap({
  gapKey,
  place,
  where,
  draggedGroup,
  dropOnly = false,
  onAdd,
  onAddRest,
}: {
  gapKey: string;
  place: SlotPlace;
  /** Completes "Add an exercise …", for screen readers. */
  where: string;
  /** The dragged slot's circuit, during a drag; undefined when nothing is dragged. */
  draggedGroup: string | null | undefined;
  /** Only a drop target: the top of a card, which the web has no insert row for either. */
  dropOnly?: boolean;
  onAdd: (place: SlotPlace) => void;
  onAddRest: (place: SlotPlace) => void;
}) {
  const palette = usePalette();
  const drag = useDragView();
  const ref = useGapRef(gapKey, place);
  const style = dropOnly ? styles.dropGap : styles.gap;

  if (drag !== null || dropOnly) {
    const targeted = drag?.target?.kind === 'gap' && drag.target.key === gapKey;
    const hint =
      !targeted || dropOnly || draggedGroup === undefined || place.group === draggedGroup
        ? null
        : place.group === null
          ? 'Release to leave the circuit'
          : 'Release to join the circuit';
    return (
      <View ref={ref} collapsable={false} style={style}>
        {targeted ? (
          <>
            <View style={[styles.dropLine, { backgroundColor: palette.accent }]} />
            {hint === null ? null : (
              <Text style={[styles.gapHint, { color: palette.accent }]}>{hint}</Text>
            )}
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View ref={ref} collapsable={false} style={[style, styles.insertRow]}>
      <View style={[styles.line, { backgroundColor: palette.border }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add an exercise ${where}`}
        hitSlop={9}
        onPress={() => {
          onAdd(place);
        }}
        style={({ pressed }) => [styles.insert, pressed && styles.insertPressed]}
      >
        <Text style={[styles.insertLabel, { color: palette.dimmed }]}>＋</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add a rest ${where}`}
        hitSlop={9}
        onPress={() => {
          onAddRest(place);
        }}
        style={({ pressed }) => [styles.insert, pressed && styles.insertPressed]}
      >
        <Text style={[styles.insertLabel, { color: palette.dimmed }]}>⏱</Text>
      </Pressable>
      <View style={[styles.line, { backgroundColor: palette.border }]} />
    </View>
  );
}

export function SlotList(props: Props) {
  const { slots, groupRest, defaultRestSeconds, onAdd, onAddRest, onRounds, onGroupRest } = props;
  const palette = usePalette();
  const drag = useDragView();
  const segments = segment(slots);

  const draggedGroup =
    drag === null
      ? undefined
      : (slots.find((slot) => slot.slotId === drag.slotId)?.supersetGroup ?? null);

  const rowActions: RowActions = {
    onEditSlot: props.onEditSlot,
    onRemoveSlot: props.onRemoveSlot,
    onDuplicateSlot: props.onDuplicateSlot,
    onJoinAbove: props.onJoinAbove,
    onLeaveCircuit: props.onLeaveCircuit,
  };
  const gapProps = { draggedGroup, onAdd, onAddRest };
  const nameOf = (slot: ExerciseSlot): string =>
    slot.kind === 'rest' ? 'rest' : slot.exerciseName;

  return (
    <View>
      <Gap
        gapKey="start"
        place={{ before: firstSlotId(segments[0]), group: null }}
        where="at the start"
        {...gapProps}
      />

      {segments.map((item, index) => {
        const after = firstSlotId(segments[index + 1]);

        if (item.kind === 'single') {
          const { slot } = item;
          return (
            <View key={slot.slotId}>
              <SlotRow
                slot={slot}
                circuit={null}
                // A rest row joining would lose its length to linkToPrevious.
                canJoinAbove={index > 0 && slot.kind === 'exercise'}
                {...rowActions}
              />
              <Gap
                gapKey={`after:${slot.slotId}`}
                place={{ before: after, group: null }}
                where={`after ${nameOf(slot)}`}
                {...gapProps}
              />
            </View>
          );
        }

        const { groupId, members } = item;
        const rounds = groupRounds(members);
        const roundRest = groupRest[groupId] ?? null;
        const exerciseCount = members.filter((slot) => slot.kind === 'exercise').length;

        return (
          <View key={groupId}>
            <View
              style={[
                styles.card,
                { borderColor: palette.circuitBorder, backgroundColor: palette.circuit },
              ]}
            >
              {/* One line, as the web's block header: the label, its rounds beside
                  it, and the rest between rounds at the far end. */}
              <View style={styles.cardHeader}>
                <Text style={[styles.cardLabel, { color: palette.circuitLabel }]}>Circuit</Text>
                <Stepper
                  label="Rounds"
                  size="compact"
                  value={rounds === null ? 'mixed' : `${String(rounds)}x`}
                  canDecrement={(rounds ?? 2) > 1}
                  canIncrement={(rounds ?? 0) < MAX_SETS}
                  onDecrement={() => {
                    onRounds(groupId, (rounds ?? 2) - 1);
                  }}
                  onIncrement={() => {
                    onRounds(groupId, (rounds ?? 0) + 1);
                  }}
                />
                <View style={styles.grow} />
                <Stepper
                  label="Rest between rounds"
                  size="compact"
                  value={`${formatRestSeconds(roundRest ?? defaultRestSeconds)} rest`}
                  canDecrement={(roundRest ?? defaultRestSeconds) > 0}
                  onDecrement={() => {
                    onGroupRest(groupId, Math.max(0, (roundRest ?? defaultRestSeconds) - 15));
                  }}
                  onIncrement={() => {
                    onGroupRest(groupId, Math.min(3600, (roundRest ?? defaultRestSeconds) + 15));
                  }}
                />
              </View>

              <Gap
                gapKey={`top:${groupId}`}
                place={{ before: members[0]?.slotId ?? null, group: groupId }}
                where="at the top of the circuit"
                dropOnly
                {...gapProps}
              />
              {members.map((slot, memberIndex) => (
                <View key={slot.slotId}>
                  <SlotRow
                    slot={slot}
                    circuit={{ first: memberIndex === 0 }}
                    canJoinAbove={false}
                    {...rowActions}
                  />
                  <Gap
                    gapKey={`in:${slot.slotId}`}
                    place={{ before: members[memberIndex + 1]?.slotId ?? after, group: groupId }}
                    where={`after ${nameOf(slot)}, in the circuit`}
                    {...gapProps}
                  />
                </View>
              ))}

              <Text style={[styles.small, { color: palette.dimmed }]}>
                {rounds === null
                  ? 'Members have different set counts. Set the rounds to line them up.'
                  : `${String(rounds)} rounds of these ${String(exerciseCount)}, in order.`}
              </Text>
            </View>

            {/* Outside the card: how a workout that ends in a circuit gets
                anything after it. */}
            <Gap
              gapKey={`after:${groupId}`}
              place={{ before: after, group: null }}
              where="after the circuit"
              {...gapProps}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  swipe: { borderRadius: 8 },
  // The web's row: 6px padding, a 14px name over a 12px prescription. 48 high
  // so it still takes a thumb.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  lifted: { opacity: 0.3 },
  text: { flex: 1, gap: 1 },
  name: { fontSize: 14, fontWeight: '600' },
  restName: { fontWeight: '500' },
  small: { fontSize: 12 },
  grow: { flex: 1 },
  grip: { fontSize: 18, paddingLeft: 2 },
  outline: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 30,
  },
  outlinePending: { borderStyle: 'dashed' },
  pill: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row' },
  action: { justifyContent: 'center', paddingHorizontal: 12, minWidth: 76 },
  actionLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.7 },
  // Fixed heights, so a gap is the same size with its buttons and without.
  gap: { height: 30, justifyContent: 'center' },
  dropGap: { height: 10, justifyContent: 'center' },
  insertRow: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.6 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  dropLine: { height: 3, borderRadius: 2 },
  gapHint: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  insert: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  insertPressed: { opacity: 0.5 },
  insertLabel: { fontSize: 15 },
  // The web's circuit block: 1px accent border, a faint tint, 8px inside.
  card: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34 },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
});
