/**
 * Whether a dragged row has left the box it belongs to.
 *
 * Viewport geometry rather than domain logic, so it lives beside the list
 * rather than in `domain/` — but it is pure, and four edge comparisons with a
 * margin are exactly the sort of thing that ships with a sign flipped, so it
 * is worth being able to test on its own.
 */

/** The sides of a box, in viewport coordinates. */
export type Bounds = { top: number; right: number; bottom: number; left: number };

/**
 * How far past an edge counts as out.
 *
 * Measured from the edge rather than from where the drag started, so it does
 * not matter how wide the block is or how close to the screen edge it sits —
 * which is the point. A circuit spans nearly the full width of a phone, so a
 * threshold measured as travel could need more room than the screen has.
 *
 * Large enough that a wobble during a reorder does not trip it, small enough
 * to be reachable in any direction. The row also says "release to leave" while
 * it is armed, so a near miss is visible before letting go.
 */
export const ESCAPE_MARGIN_PX = 24;

/**
 * True when `row` has cleared any edge of `bounds` by the margin.
 *
 * Any edge, because the direction with room depends on the screen: sideways
 * needs width the phone may not have, while up and down leave through the
 * block's header and footer, which are inside its box and always present.
 */
export function hasEscaped(row: Bounds, bounds: Bounds): boolean {
  return (
    row.top < bounds.top - ESCAPE_MARGIN_PX ||
    row.bottom > bounds.bottom + ESCAPE_MARGIN_PX ||
    row.left < bounds.left - ESCAPE_MARGIN_PX ||
    row.right > bounds.right + ESCAPE_MARGIN_PX
  );
}
