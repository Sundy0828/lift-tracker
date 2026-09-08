import { describe, expect, it } from 'vitest';
import { ESCAPE_MARGIN_PX, hasEscaped, type Bounds } from './escape';

/**
 * A circuit block roughly as it sits on a phone: nearly the full 412 px width,
 * and taller than the row inside it because the header, footer and padding are
 * all part of the box.
 */
const BLOCK: Bounds = { top: 100, right: 400, bottom: 240, left: 12 };

/** A member row, inset from the block by its 8 px of padding. */
const ROW: Bounds = { top: 140, right: 392, bottom: 180, left: 20 };

const moved = (dx: number, dy: number): Bounds => ({
  top: ROW.top + dy,
  bottom: ROW.bottom + dy,
  left: ROW.left + dx,
  right: ROW.right + dx,
});

describe('hasEscaped', () => {
  it('is false for a row sitting where it belongs', () => {
    expect(hasEscaped(ROW, BLOCK)).toBe(false);
  });

  it('is false while reordering inside the block', () => {
    // A swap is a drag about the height of a row, and the block is taller
    // than its rows, so this must not read as leaving.
    expect(hasEscaped(moved(0, -40), BLOCK)).toBe(false);
    expect(hasEscaped(moved(0, 40), BLOCK)).toBe(false);
  });

  it('is false for a wobble that has not cleared the padding and margin', () => {
    expect(hasEscaped(moved(20, 0), BLOCK)).toBe(false);
    expect(hasEscaped(moved(-20, 0), BLOCK)).toBe(false);
  });

  it('is true once the row clears the top edge', () => {
    // Up and down are the directions that always have room: they leave
    // through the block's own header and footer.
    const needed = ROW.top - BLOCK.top + ESCAPE_MARGIN_PX;
    expect(hasEscaped(moved(0, -needed + 1), BLOCK)).toBe(false);
    expect(hasEscaped(moved(0, -needed - 1), BLOCK)).toBe(true);
  });

  it('is true once the row clears the bottom edge', () => {
    const needed = BLOCK.bottom - ROW.bottom + ESCAPE_MARGIN_PX;
    expect(hasEscaped(moved(0, needed + 1), BLOCK)).toBe(true);
  });

  it('is true once the row clears either side', () => {
    const needed = ROW.left - BLOCK.left + ESCAPE_MARGIN_PX;
    expect(hasEscaped(moved(-needed - 1, 0), BLOCK)).toBe(true);
    expect(hasEscaped(moved(needed + 1, 0), BLOCK)).toBe(true);
  });

  it('does not care how wide the block is, only how far past its edge', () => {
    // The reason the criterion is edge-relative: a wide block on a narrow
    // screen must not need more travel than a narrow one.
    const wide: Bounds = { top: 100, right: 4000, bottom: 240, left: 12 };
    const wideRow: Bounds = { top: 140, right: 3992, bottom: 180, left: 20 };
    const travel = ESCAPE_MARGIN_PX + 8 + 1;

    expect(hasEscaped({ ...wideRow, left: wideRow.left - travel }, wide)).toBe(true);
    expect(hasEscaped({ ...ROW, left: ROW.left - travel }, BLOCK)).toBe(true);
  });

  it('counts a diagonal drag by whichever edge it crossed', () => {
    const clearsTop = ROW.top - BLOCK.top + ESCAPE_MARGIN_PX + 1;
    expect(hasEscaped(moved(10, -clearsTop), BLOCK)).toBe(true);
  });
});
