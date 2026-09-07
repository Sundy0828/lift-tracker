import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
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
 * Vertical drag reordering that works with a thumb, plus drag-to-group.
 *
 * HTML5 drag-and-drop does not fire on touch at all, so this uses dnd-kit's
 * pointer sensor (~11 kB gzipped for core + sortable + modifiers). Its
 * keyboard sensor also makes reordering reachable without a pointer, and the
 * explicit up/down buttons give a third route on small screens where dragging
 * inside a scrolling list is fiddly.
 *
 * **Grouping** reuses the same gesture: hold a dragged row over another for a
 * moment and the drop becomes "join that one's circuit" instead of "move
 * here" — the folder-drop pattern, so a normal reorder is unaffected. The
 * target says so before you release, and pressing `g` mid-drag skips the wait
 * (which is also the keyboard route: focus the handle, Space, arrow to the
 * target, `g`, Space).
 */

/**
 * How long a dragged row must hover before the drop means "group".
 *
 * Short enough not to feel like a stall, long enough that passing over a row
 * on the way somewhere else does not arm it. The target dims into a "hold to
 * group" state immediately, so the wait is never silent.
 */
const GROUP_DWELL_MS = 420;

type GroupIntent = { activeId: string; targetId: string } | null;

/** `pending` is hovering-but-not-yet-armed; `intent` is armed. */
type GroupState = { pending: GroupIntent; intent: GroupIntent };

const GroupStateContext = createContext<GroupState>({ pending: null, intent: null });

/**
 * What the current drag would do to a row: nothing, arming, or grouping.
 *
 * Consumed by SortableRow in this same file, so splitting it out to satisfy
 * fast refresh would buy nothing.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useGroupState(): GroupState {
  return useContext(GroupStateContext);
}

type SortableRowProps = {
  id: string;
  /** Position and count, for the move buttons and screen-reader text. */
  index: number;
  total: number;
  label: string;
  onMove: (from: number, to: number) => void;
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

  const { pending, intent } = useGroupState();
  const isGroupTarget = intent?.targetId === id;
  const isArming = !isGroupTarget && pending?.targetId === id;

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
        aria-description="Hold over another exercise to group them, or press g while dragging."
        {...attributes}
        {...listeners}
      >
        ⠿
      </ActionIcon>

      <div className={classes.body}>{children}</div>

      {isGroupTarget ? (
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
  children: ReactNode;
};

export function SortableList({ ids, onReorder, onGroup, canGroup, children }: SortableListProps) {
  const sensors = useSensors(
    /**
     * A short hold rather than a distance threshold. Two reasons: a drag no
     * longer starts from a stray twitch while scrolling, and a horizontal
     * move inside the hold cancels activation, which is what leaves the
     * swipe-to-delete gesture free to claim it.
     */
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [intent, setIntent] = useState<GroupIntent>(null);
  const [pending, setPending] = useState<GroupIntent>(null);
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

  // `g` commits the intent straight away, which is the only route open to the
  // keyboard sensor — there is no hovering without a pointer. Registered once
  // for the component's life and gated on the ref, so it can never miss a
  // target because an effect had not re-run yet.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'g' && event.key !== 'G') return;
      const target = hover.current;
      if (target === null) return;
      event.preventDefault();
      setIntent(target);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopDwell();
    };
  }, []);

  const handleDragStart = (event: DragStartEvent): void => {
    pointerDrag.current = !(event.activatorEvent instanceof KeyboardEvent);
    stopDwell();
    setIntent(null);
    setPending(null);
    hover.current = null;
  };

  const handleDragOver = ({ active, over }: DragOverEvent): void => {
    // The target changed, so any pending or settled intent is stale.
    stopDwell();
    setIntent(null);

    const activeId = String(active.id);
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
    hover.current = null;
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    const settled = intent;
    finish();

    if (over === null || active.id === over.id) return;
    const activeId = String(active.id);
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
      // Vertical only, but deliberately NOT restricted to the parent element:
      // a circuit member's parent *is* the circuit block, so clamping to it
      // would make dragging out of a circuit impossible.
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={finish}
    >
      <SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
        <GroupStateContext.Provider value={{ pending, intent }}>
          <div className={classes.list}>{children}</div>
        </GroupStateContext.Provider>
      </SortableContext>
    </DndContext>
  );
}
