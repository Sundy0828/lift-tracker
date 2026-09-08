import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionIcon, Group } from '@mantine/core';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import classes from './SortableList.module.css';

/**
 * Drag reordering that works with a thumb, and the two circuit gestures.
 *
 * HTML5 drag-and-drop does not fire on touch at all, so this uses dnd-kit's
 * pointer sensor (~11 kB gzipped for core + sortable + modifiers). Its
 * keyboard sensor also makes reordering reachable without a pointer, and the
 * explicit up/down buttons give a third route on small screens where dragging
 * inside a scrolling list is fiddly.
 *
 * **Joining** reuses the reorder gesture: hold a dragged row over another for
 * a moment and the drop becomes "join that one's circuit" instead of "move
 * here" — the folder-drop pattern, so a normal reorder is unaffected. The
 * target says so before you release, and `g` mid-drag skips the wait.
 *
 * **Leaving** is a sideways drag, and has to be. Dragging vertically clear of
 * the block only works when a position outside it exists: a two-exercise
 * workout that is entirely one circuit has no outside, and every reorder
 * leaves the two members adjacent and still grouped. So a row already in a
 * circuit is freed from the vertical axis and pulling it out of the block
 * sideways means what it looks like. `u` is the keyboard equivalent.
 */

/**
 * How long a dragged row must hover before the drop means "group".
 *
 * Short enough not to feel like a stall, long enough that passing over a row
 * on the way somewhere else does not arm it. The target dims into a "hold to
 * group" state immediately, so the wait is never silent.
 */
const GROUP_DWELL_MS = 420;

/**
 * How far sideways a circuit member travels before the drop means "leave".
 *
 * Comfortably past any wobble in a drag that meant to reorder, and roughly a
 * thumb's width so it reads as a deliberate pull rather than a slip.
 */
const PULL_OUT_PX = 56;

type GroupIntent = { activeId: string; targetId: string } | null;

/**
 * What the current drag would do.
 *
 * `pending` is hovering-but-not-yet-armed and `intent` is armed, both for
 * joining. `pullOut` is the id of a row displaced far enough sideways that
 * releasing takes it out of its circuit.
 */
type DragState = { pending: GroupIntent; intent: GroupIntent; pullOut: string | null };

const DragStateContext = createContext<DragState>({
  pending: null,
  intent: null,
  pullOut: null,
});

/**
 * What the current drag would do to a row: nothing, arming, grouping, or
 * leaving.
 *
 * Consumed by SortableRow in this same file, so splitting it out to satisfy
 * fast refresh would buy nothing.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDragState(): DragState {
  return useContext(DragStateContext);
}

type SortableRowProps = {
  id: string;
  /** Position and count, for the move buttons and screen-reader text. */
  index: number;
  total: number;
  label: string;
  onMove: (from: number, to: number) => void;
  /** True when this row is in a circuit, which is what a sideways drag acts on. */
  inGroup?: boolean;
  /**
   * Row-specific actions, rendered last — at the far right of the row. Delete
   * lives here, as far from the handle as the row allows.
   */
  extraControls?: ReactNode;
  /**
   * Wraps the row's visible surface. Used for swipe-to-delete, which has to
   * sit inside the sortable node — that node carries the drag transform — but
   * around the content it slides.
   */
  surface?: (row: ReactNode) => ReactNode;
  children: ReactNode;
};

export function SortableRow({
  id,
  index,
  total,
  label,
  onMove,
  inGroup = false,
  extraControls,
  surface,
  children,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const { pending, intent, pullOut } = useDragState();
  const isGroupTarget = intent?.targetId === id;
  const isArming = !isGroupTarget && pending?.targetId === id;
  const isLeaving = pullOut === id;

  const row = (
    <div className={classes.rowInner}>
      <ActionIcon
        ref={setActivatorNodeRef}
        variant="subtle"
        color="gray"
        size="md"
        className={classes.handle}
        // Marks this subtree as drag-only, so a horizontal pull starting here
        // cannot also arm the swipe gesture wrapped around the row.
        data-drag-handle="true"
        aria-label={`Reorder or group ${label}`}
        aria-description={
          inGroup
            ? 'Hold over another exercise to group them, or press u while dragging to leave the circuit.'
            : 'Hold over another exercise to group them, or press g while dragging.'
        }
        {...attributes}
        {...listeners}
      >
        ⠿
      </ActionIcon>

      <div className={classes.body}>{children}</div>

      {isLeaving ? (
        <span className={`${classes.groupHint} ${classes.leaveHint}`} aria-hidden="true">
          release to leave
        </span>
      ) : isGroupTarget ? (
        <span className={classes.groupHint} aria-hidden="true">
          release to group
        </span>
      ) : isArming ? (
        <span className={`${classes.groupHint} ${classes.groupHintPending}`} aria-hidden="true">
          hold to group
        </span>
      ) : null}

      <Group gap={2} wrap="nowrap">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          disabled={index === 0}
          aria-label={`Move ${label} up`}
          onClick={() => {
            onMove(index, index - 1);
          }}
        >
          ↑
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          disabled={index === total - 1}
          aria-label={`Move ${label} down`}
          onClick={() => {
            onMove(index, index + 1);
          }}
        >
          ↓
        </ActionIcon>
        {extraControls}
      </Group>
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className={classes.row}
      data-dragging={isDragging ? 'true' : undefined}
      data-group-target={isGroupTarget ? 'true' : undefined}
      data-group-arming={isArming ? 'true' : undefined}
      data-leaving={isLeaving ? 'true' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {surface === undefined ? row : surface(row)}
    </div>
  );
}

type SortableListProps = {
  /** Stable ids, in current display order. */
  ids: readonly string[];
  onReorder: (from: number, to: number) => void;
  /** Omit to disable grouping for this list. */
  onGroup?: (activeId: string, targetId: string) => void;
  /** Rejects pairs that cannot be grouped, so no intent is offered. */
  canGroup?: (activeId: string, targetId: string) => boolean;
  /** Called when a row is dragged out of its circuit. */
  onLeave?: (activeId: string) => void;
  /** True for a row that is in a circuit, and so has something to leave. */
  canLeave?: (activeId: string) => boolean;
  children: ReactNode;
};

export function SortableList({
  ids,
  onReorder,
  onGroup,
  canGroup,
  onLeave,
  canLeave,
  children,
}: SortableListProps) {
  const sensors = useSensors(
    /**
     * A short hold rather than a distance threshold, so a drag does not start
     * from a stray twitch while scrolling.
     *
     * `tolerance` is deliberately generous. In dnd-kit it is an **abort**
     * budget, not a threshold: moving further than this before the delay
     * elapses cancels activation outright, and the press has to be released
     * and repeated. A small value therefore makes a quick, confident grab feel
     * broken — press, flick, nothing happens, press again. Set high enough
     * that a real gesture never trips it, the delay stays a delay and the drag
     * simply begins wherever the pointer has got to.
     */
    useSensor(PointerSensor, { activationConstraint: { delay: 120, tolerance: 400 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [intent, setIntent] = useState<GroupIntent>(null);
  const [pending, setPending] = useState<GroupIntent>(null);
  const [pullOut, setPullOut] = useState<string | null>(null);
  /** The row being dragged, and whether it has a circuit to leave. */
  const [leavable, setLeavable] = useState<string | null>(null);
  /**
   * The current drop target, in a ref rather than state.
   *
   * `g` has to act on whatever is under the cursor *now*. Reading it from
   * state would mean the key listener closes over whichever value existed when
   * the effect last ran, so pressing `g` straight after an arrow key — or
   * quickly after a drag move — would use a stale target, or none at all.
   * Nothing renders from it, so a ref is both safer and cheaper.
   */
  const hover = useRef<GroupIntent>(null);
  /** The dragged row, for the `u` shortcut, which needs no target. */
  const active = useRef<string | null>(null);
  const dwell = useRef<number | null>(null);
  /**
   * Only a pointer drag can "hover". During a keyboard drag the target simply
   * stays wherever the last arrow key left it, so a dwell timer would turn any
   * pause into a group — arrow, hesitate, drop, and the reorder silently
   * became a circuit. Keyboard grouping is `g`, deliberately.
   */
  const pointerDrag = useRef(false);

  const stopDwell = (): void => {
    if (dwell.current !== null) {
      window.clearTimeout(dwell.current);
      dwell.current = null;
    }
  };

  const groupable = (activeId: string, targetId: string): boolean =>
    onGroup !== undefined && activeId !== targetId && (canGroup?.(activeId, targetId) ?? true);

  /**
   * `canLeave` behind a ref so the key listener below can depend on nothing.
   *
   * Callers pass an inline arrow, so the prop is a new function on every
   * render. Depending on it directly would re-run that effect every render —
   * and its cleanup stops the dwell timer, so the hold-to-group timer would be
   * cancelled by the very re-render that starts it, and joining could never
   * arm at all.
   */
  const canLeaveRef = useRef(canLeave);
  useEffect(() => {
    canLeaveRef.current = canLeave;
  }, [canLeave]);

  // `g` commits a join straight away and `u` leaves a circuit, which are the
  // only routes open to the keyboard sensor — there is no hovering without a
  // pointer, and no sideways drag either. Registered once for the component's
  // life and gated on refs, so neither can miss because an effect had not
  // re-run yet.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'g' || event.key === 'G') {
        const target = hover.current;
        if (target === null) return;
        event.preventDefault();
        setIntent(target);
        return;
      }
      if (event.key === 'u' || event.key === 'U') {
        const activeId = active.current;
        if (activeId === null || !(canLeaveRef.current?.(activeId) ?? false)) return;
        event.preventDefault();
        setPullOut(activeId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopDwell();
    };
  }, []);

  const handleDragStart = (event: DragStartEvent): void => {
    const activeId = String(event.active.id);
    pointerDrag.current = !(event.activatorEvent instanceof KeyboardEvent);
    stopDwell();
    setIntent(null);
    setPending(null);
    setPullOut(null);
    hover.current = null;
    active.current = activeId;
    // Frees this drag from the vertical axis when there is a circuit to pull
    // out of, and only then, so a plain reorder stays crisp.
    setLeavable((canLeave?.(activeId) ?? false) ? activeId : null);
  };

  const handleDragMove = ({ delta }: DragMoveEvent): void => {
    const activeId = active.current;
    if (activeId === null || leavable !== activeId) return;

    const pulled = Math.abs(delta.x) >= PULL_OUT_PX;
    setPullOut((current) => {
      if (pulled) return activeId;
      // A `u` press stands until the row is dragged back inside the block.
      return current === activeId && Math.abs(delta.x) < PULL_OUT_PX / 2 ? null : current;
    });
  };

  const handleDragOver = ({ active: dragged, over }: DragOverEvent): void => {
    // The target changed, so any pending or settled intent is stale.
    stopDwell();
    setIntent(null);

    const activeId = String(dragged.id);
    const targetId = over === null ? null : String(over.id);

    if (targetId === null || !groupable(activeId, targetId)) {
      hover.current = null;
      setPending(null);
      return;
    }

    hover.current = { activeId, targetId };
    setPending({ activeId, targetId });
    if (!pointerDrag.current) return;

    dwell.current = window.setTimeout(() => {
      setIntent({ activeId, targetId });
    }, GROUP_DWELL_MS);
  };

  const finish = (): void => {
    stopDwell();
    setIntent(null);
    setPending(null);
    setPullOut(null);
    setLeavable(null);
    hover.current = null;
    active.current = null;
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active: dragged, over } = event;
    const settled = intent;
    const leaving = pullOut;
    const activeId = String(dragged.id);
    finish();

    // Leaving wins over both: the row was pulled clear of the block, so where
    // it happens to hover is not what the gesture meant.
    if (leaving === activeId) {
      onLeave?.(activeId);
      return;
    }

    if (over === null || dragged.id === over.id) return;
    const targetId = String(over.id);

    // Grouping wins over reordering: groupWithSlot does its own positioning,
    // so running both would move the row twice.
    if (settled !== null && settled.activeId === activeId && settled.targetId === targetId) {
      onGroup?.(activeId, targetId);
      return;
    }

    const from = ids.indexOf(activeId);
    const to = ids.indexOf(targetId);
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin first: for "drop onto that one" the target should be
      // whatever is literally under the finger. closestCenter is the fallback
      // for keyboard drags and for gaps between rows, where nothing is.
      collisionDetection={(args) => {
        const within = pointerWithin(args);
        return within.length > 0 ? within : closestCenter(args);
      }}
      // Vertical only for a plain reorder, which keeps it precise. A row that
      // is in a circuit moves freely, because sideways *is* the gesture for
      // leaving one — and deliberately NOT restricted to the parent element
      // either: a member's parent is the circuit block, so clamping to it
      // would make leaving impossible.
      modifiers={leavable === null ? [restrictToVerticalAxis] : []}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={finish}
    >
      <SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
        <DragStateContext.Provider value={{ pending, intent, pullOut }}>
          <div className={classes.list}>{children}</div>
        </DragStateContext.Provider>
      </SortableContext>
    </DndContext>
  );
}
