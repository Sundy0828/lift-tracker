import type { ExerciseSlot, SlotPlace } from '@lift/domain/workouts';
import {
  formatPrescription,
  formatPrescriptionTarget,
  formatRange,
  formatRestSeconds,
  groupRounds,
  MAX_SETS,
  measureOf,
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
import { InlineNumber } from './controls';
import { LIFT_MS, useDragHandlers, useDragView, useGapRef, useRowRef } from './drag';

/** The web's limit on a rest, in seconds. */
const MAX_REST_SECONDS = 3600;

/**
 * The workout's slots: the web's `SlotList`, for a thumb.
 *
 * A circuit is a card with its members inside, and the card owns the rounds
 * and the rest between rounds, since a circuit's set count *is* its round
 * count. An insert row sits between every pair of slots, inside cards and
 * out, as on the web, plus one below each card that adds after it rather
 * than into it.
 *
 * Every row carries the web's controls: the ⠿ handle, ↑ and ↓, and ✕. A rest
 * row's length and a circuit's rounds and round rest are typed in place.
 *
 * On top of those, the phone's own gestures: hold a row to lift it, drop it in
 * a gap to move it, hold it over another row to make a circuit, drop it
 * outside its card to leave (see ./drag). Swiping left deletes, right
 * duplicates or joins or leaves a circuit.
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
  /** Moves the slot at `from` to `to`, both indexes into `slots`. */
  onMove: (from: number, to: number) => void;
  onRestSeconds: (slotId: string, seconds: number) => void;
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
  | 'onEditSlot'
  | 'onMove'
  | 'onRestSeconds'
  | 'onRemoveSlot'
  | 'onDuplicateSlot'
  | 'onJoinAbove'
  | 'onLeaveCircuit'
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

/** The second line under a name: the prescription, or inside a circuit only the reps. */
function prescriptionLine(slot: ExerciseSlot, inCircuit: boolean): string {
  if (slot.kind === 'rest') return '';
  // Inside a circuit the set count belongs to the card.
  if (!inCircuit) return formatPrescription(slot.prescription);
  return measureOf(slot.prescription) === 'reps'
    ? `${formatRange(slot.prescription.repRange)} reps`
    : formatPrescriptionTarget(slot.prescription);
}

/**
 * What a row shows: the ⠿ handle, then the name over its prescription, or a
 * rest's length. Alone, it is the dragged copy; in the list, `body` makes the
 * middle tappable or typeable and `controls` adds ↑ ↓ ✕ at the end.
 */
export function SlotFace({
  slot,
  inCircuit,
  body,
  controls,
}: {
  slot: ExerciseSlot;
  inCircuit: boolean;
  /** Replaces the middle: the Pressable that opens the sheet, or the rest's box. */
  body?: (content: ReactNode) => ReactNode;
  controls?: ReactNode;
}) {
  const palette = usePalette();
  const content =
    slot.kind === 'rest' ? (
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
        <Text style={[styles.small, { color: palette.dimmed }]}>
          {prescriptionLine(slot, inCircuit)}
        </Text>
      </>
    );

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
      <Text style={[styles.grip, { color: palette.dimmed }]} accessibilityElementsHidden>
        ⠿
      </Text>
      {body === undefined ? <View style={styles.text}>{content}</View> : body(content)}
      {controls}
    </View>
  );
}

/** ↑, ↓ or ✕ at the end of a row. */
function RowButton({
  glyph,
  label,
  disabled = false,
  danger = false,
  onPress,
}: {
  glyph: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
    >
      <Text
        style={[
          styles.rowGlyph,
          { color: danger ? palette.danger : palette.dimmed },
          disabled && styles.disabled,
        ]}
      >
        {glyph}
      </Text>
    </Pressable>
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
  index,
  count,
  circuit,
  canJoinAbove,
  onEditSlot,
  onMove,
  onRestSeconds,
  onRemoveSlot,
  onDuplicateSlot,
  onJoinAbove,
  onLeaveCircuit,
}: {
  slot: ExerciseSlot;
  /** Its place in the whole list, for ↑ and ↓. */
  index: number;
  count: number;
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
          <SlotFace
            slot={slot}
            inCircuit={circuit !== null}
            body={(content) =>
              slot.kind === 'rest' ? (
                <View style={[styles.text, styles.restBody]}>
                  <Text style={[styles.name, styles.restName, { color: palette.dimmed }]}>
                    Rest
                  </Text>
                  <InlineNumber
                    label="Rest length"
                    value={restSlotSeconds(slot)}
                    suffix="s"
                    min={0}
                    max={MAX_REST_SECONDS}
                    width={76}
                    onCommit={(seconds) => {
                      if (seconds !== null) onRestSeconds(slot.slotId, seconds);
                    }}
                  />
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${label}`}
                  accessibilityHint="Hold to drag it. Swipe left to delete, right for more."
                  onPress={() => {
                    onEditSlot(slot);
                  }}
                  style={({ pressed }) => [styles.text, pressed && styles.pressed]}
                >
                  {content}
                </Pressable>
              )
            }
            controls={
              <>
                <RowButton
                  glyph="↑"
                  label={`Move ${label} up`}
                  disabled={index === 0}
                  onPress={() => {
                    onMove(index, index - 1);
                  }}
                />
                <RowButton
                  glyph="↓"
                  label={`Move ${label} down`}
                  disabled={index === count - 1}
                  onPress={() => {
                    onMove(index, index + 1);
                  }}
                />
                <RowButton
                  glyph="✕"
                  label={`Delete ${label}`}
                  danger
                  onPress={() => {
                    onRemoveSlot(slot.slotId);
                  }}
                />
              </>
            }
          />
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
    onMove: props.onMove,
    onRestSeconds: props.onRestSeconds,
    onRemoveSlot: props.onRemoveSlot,
    onDuplicateSlot: props.onDuplicateSlot,
    onJoinAbove: props.onJoinAbove,
    onLeaveCircuit: props.onLeaveCircuit,
  };
  const gapProps = { draggedGroup, onAdd, onAddRest };
  const nameOf = (slot: ExerciseSlot): string =>
    slot.kind === 'rest' ? 'rest' : slot.exerciseName;
  const placeOf = (slot: ExerciseSlot) => ({ index: slots.indexOf(slot), count: slots.length });

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
                {...placeOf(slot)}
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
        const lead = members[0] === undefined ? 'nothing' : nameOf(members[0]);

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
                <InlineNumber
                  label={`Rounds for the circuit starting with ${lead}`}
                  value={rounds}
                  suffix="x"
                  placeholder="mixed"
                  min={1}
                  max={MAX_SETS}
                  width={66}
                  onCommit={(next) => {
                    if (next !== null) onRounds(groupId, next);
                  }}
                />
                <View style={styles.grow} />
                {/* Pause after a whole round, on top of any rest rows. Empty is
                    "my default", shown as the placeholder. */}
                <Text style={[styles.small, { color: palette.dimmed }]}>round rest</Text>
                <InlineNumber
                  label={`Rest between rounds of the circuit starting with ${lead}`}
                  value={roundRest}
                  suffix="s"
                  placeholder={formatRestSeconds(defaultRestSeconds)}
                  min={0}
                  max={MAX_REST_SECONDS}
                  nullable
                  width={76}
                  onCommit={(seconds) => {
                    onGroupRest(groupId, seconds);
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
                    {...placeOf(slot)}
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
                  ? 'Members have different set counts — set the rounds to line them up.'
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
    gap: 4,
    minHeight: 48,
    paddingLeft: 8,
    paddingRight: 2,
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
  grip: { fontSize: 16, paddingRight: 2 },
  restBody: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowButton: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  rowGlyph: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.3 },
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
