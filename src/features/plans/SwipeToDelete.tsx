import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import classes from './SwipeToDelete.module.css';

/**
 * Swipe a row left to delete it.
 *
 * Hand-rolled on pointer events rather than pulled from a library: it is ~60
 * lines, and the two things that make it behave are both specific to this list
 * — `touch-action: pan-y` so the page still scrolls vertically, and swallowing
 * the click that a swipe would otherwise fire on the row underneath.
 *
 * It shares the row with dnd-kit without fighting it. Dragging is armed only
 * on the handle, and only after a hold; a horizontal move inside that hold
 * cancels the drag, which leaves the gesture to this.
 */

/** How far left the row must travel to count as a delete. */
const COMMIT_PX = 96;
/** Movement before a gesture is claimed as a horizontal swipe. */
const CLAIM_PX = 12;

type Props = {
  onDelete: () => void;
  /** Named in the revealed action, e.g. "Delete Bench Press". */
  label: string;
  children: ReactNode;
};

export function SwipeToDelete({ onDelete, label, children }: Props) {
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

    // Left only: there is nothing revealed on the other side.
    setOffset(Math.min(0, dx));
  };

  const onPointerUp = (): void => {
    if (swiping.current && offset <= -COMMIT_PX) {
      swallowClick.current = true;
      reset();
      onDelete();
      return;
    }
    if (swiping.current) swallowClick.current = true;
    reset();
  };

  const revealed = offset <= -CLAIM_PX;

  return (
    <div className={classes.wrap}>
      <div className={classes.behind} aria-hidden="true" data-armed={offset <= -COMMIT_PX}>
        <span className={classes.behindLabel}>{revealed ? label : ''}</span>
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
