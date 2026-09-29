import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import classes from './SwipeRow.module.css';

/**
 * Swipe a row sideways to act on it: left to delete, right to leave a circuit.
 *
 * Hand-rolled on pointer events rather than pulled from a library: it is ~90
 * lines, and the two things that make it behave are both specific to this list
 * — `touch-action: pan-y` so the page still scrolls vertically, and swallowing
 * the click that a swipe would otherwise fire on the row underneath.
 *
 * It shares the row with dnd-kit without fighting it. Dragging is armed only
 * on the handle, and only after a hold; a horizontal move inside that hold
 * cancels the drag, which leaves the gesture to this.
 *
 * Rightwards exists because **dragging out of a circuit is impossible when the
 * whole list is the circuit** — there is no "outside" to drag to. A gesture
 * works at any member count, which a drag cannot.
 */

/** How far the row must travel to count as a commit. */
const COMMIT_PX = 96;
/** Movement before a gesture is claimed as a horizontal swipe. */
const CLAIM_PX = 12;

export type SwipeAction = {
  /** Named in the revealed panel, e.g. "Delete Bench Press". */
  label: string;
  tone: 'danger' | 'neutral';
  onCommit: () => void;
};

type Props = {
  /** Revealed by swiping left. Omit to disable that direction. */
  left?: SwipeAction;
  /** Revealed by swiping right. Omit to disable that direction. */
  right?: SwipeAction;
  children: ReactNode;
};

export function SwipeRow({ left, right, children }: Props) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  /** Set on release so the click a swipe generates is not acted on. */
  const swallowClick = useRef(false);

  const reset = (): void => {
    start.current = null;
    swiping.current = false;
    setOffset(0);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // The drag handle owns its own gesture. Without this a pull that starts
    // there would arm both, and the row would slide sideways while dnd-kit
    // moved it up and down.
    if (event.target instanceof Element && event.target.closest('[data-drag-handle]') !== null) {
      return;
    }
    start.current = { x: event.clientX, y: event.clientY };
    swiping.current = false;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const from = start.current;
    if (from === null) return;

    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;

    if (!swiping.current) {
      // Claim the gesture only when it is clearly horizontal, so a vertical
      // drag stays a page scroll.
      if (Math.abs(dx) < CLAIM_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swiping.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    // Clamped to the directions that have somewhere to go, so a row with only
    // one action cannot be dragged towards an empty reveal.
    const lower = left === undefined ? 0 : -Infinity;
    const upper = right === undefined ? 0 : Infinity;
    setOffset(Math.min(upper, Math.max(lower, dx)));
  };

  const onPointerUp = (): void => {
    if (!swiping.current) {
      reset();
      return;
    }

    // A swipe always swallows its click, committed or not: the row underneath
    // opens the prescription editor, which is not what a swipe asked for.
    swallowClick.current = true;
    const committed = offset <= -COMMIT_PX ? left : offset >= COMMIT_PX ? right : undefined;
    reset();
    committed?.onCommit();
  };

  const revealed = offset <= -CLAIM_PX ? left : offset >= CLAIM_PX ? right : undefined;
  const armed = offset <= -COMMIT_PX || offset >= COMMIT_PX;

  return (
    <div className={classes.wrap}>
      <div
        className={classes.behind}
        aria-hidden="true"
        data-side={offset > 0 ? 'left' : 'right'}
        data-tone={revealed?.tone}
        data-armed={armed ? 'true' : undefined}
      >
        <span className={classes.behindLabel}>{revealed?.label ?? ''}</span>
      </div>

      <div
        className={classes.surface}
        style={{ transform: `translateX(${String(offset)}px)` }}
        // Derived from state, not the ref: mid-swipe the row tracks the finger
        // with no transition, and releasing sets the offset back to 0 with the
        // transition on, which is the spring-back.
        data-swiping={offset !== 0 ? 'true' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
}
