// @vitest-environment jsdom
// Drives real pointer events. The suite defaults to node; see vite.config.ts.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeRow, type SwipeAction } from './SwipeRow';

/**
 * The swipe gesture, driven with real pointer events.
 *
 * Worth a component test rather than only an e2e one: this is hand-rolled
 * pointer maths with a direction, a claim threshold and a commit threshold,
 * and every one of those is a place to be off by a sign.
 */

const action = (label: string, tone: SwipeAction['tone'], onCommit: () => void): SwipeAction => ({
  label,
  tone,
  onCommit,
});

function setup(options: { left?: SwipeAction; right?: SwipeAction }) {
  render(
    <SwipeRow {...options}>
      <button type="button">Bench Press</button>
    </SwipeRow>,
  );
  const surface = screen.getByText('Bench Press').parentElement;
  if (surface === null) throw new Error('no surface');
  return surface;
}

/** One complete gesture: press, travel horizontally, release. */
function swipe(surface: Element, dx: number, options: { release?: boolean; dy?: number } = {}) {
  const dy = options.dy ?? 0;
  fireEvent.pointerDown(surface, { clientX: 200, clientY: 50, pointerId: 1, button: 0 });
  // Two moves: the first crosses the claim threshold, the second arrives.
  fireEvent.pointerMove(surface, {
    clientX: 200 + Math.sign(dx) * 20,
    clientY: 50,
    pointerId: 1,
  });
  fireEvent.pointerMove(surface, { clientX: 200 + dx, clientY: 50 + dy, pointerId: 1 });
  if (options.release !== false) fireEvent.pointerUp(surface, { pointerId: 1 });
}

const offsetOf = (surface: Element): string =>
  surface instanceof HTMLElement ? surface.style.transform : '';

describe('swiping left', () => {
  it('commits past the threshold', () => {
    const onCommit = vi.fn();
    const surface = setup({ left: action('Delete Bench Press', 'danger', onCommit) });

    swipe(surface, -140);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('springs back short of the threshold without committing', () => {
    const onCommit = vi.fn();
    const surface = setup({ left: action('Delete Bench Press', 'danger', onCommit) });

    swipe(surface, -40);
    expect(onCommit).not.toHaveBeenCalled();
    expect(offsetOf(surface)).toBe('translateX(0px)');
  });

  it('names the action once revealed, before release', () => {
    const surface = setup({ left: action('Delete Bench Press', 'danger', vi.fn()) });

    swipe(surface, -140, { release: false });
    expect(screen.getByText('Delete Bench Press')).toBeInTheDocument();
  });
});

describe('swiping right', () => {
  it('commits the right action, not the left one', () => {
    const onDelete = vi.fn();
    const onLeave = vi.fn();
    const surface = setup({
      left: action('Delete Bench Press', 'danger', onDelete),
      right: action('Leave circuit', 'neutral', onLeave),
    });

    swipe(surface, 140);
    expect(onLeave).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('tracks the finger rightwards while held', () => {
    const surface = setup({
      left: action('Delete', 'danger', vi.fn()),
      right: action('Leave circuit', 'neutral', vi.fn()),
    });

    swipe(surface, 140, { release: false });
    expect(offsetOf(surface)).toBe('translateX(140px)');
    expect(screen.getByText('Leave circuit')).toBeInTheDocument();
  });

  it('springs back short of the threshold', () => {
    const onLeave = vi.fn();
    const surface = setup({
      left: action('Delete', 'danger', vi.fn()),
      right: action('Leave circuit', 'neutral', onLeave),
    });

    swipe(surface, 40);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('goes nowhere when there is no right action', () => {
    // A row outside a circuit: it must not be draggable towards an empty
    // reveal.
    const surface = setup({ left: action('Delete', 'danger', vi.fn()) });

    swipe(surface, 140, { release: false });
    expect(offsetOf(surface)).toBe('translateX(0px)');
    expect(screen.queryByText('Leave circuit')).not.toBeInTheDocument();
  });
});

describe('what is not a swipe', () => {
  it('ignores a mostly-vertical drag, so the page can still scroll', () => {
    const onCommit = vi.fn();
    const surface = setup({ left: action('Delete', 'danger', onCommit) });

    fireEvent.pointerDown(surface, { clientX: 200, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 160, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    expect(onCommit).not.toHaveBeenCalled();
    expect(offsetOf(surface)).toBe('translateX(0px)');
  });

  it('ignores a gesture that starts on the drag handle', () => {
    const onCommit = vi.fn();
    render(
      <SwipeRow left={action('Delete', 'danger', onCommit)}>
        <button type="button" data-drag-handle="true">
          handle
        </button>
      </SwipeRow>,
    );
    const handle = screen.getByText('handle');
    const surface = handle.parentElement;
    if (surface === null) throw new Error('no surface');

    fireEvent.pointerDown(handle, { clientX: 200, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('swallows the click a swipe would otherwise fire on the row', () => {
    const onRowClick = vi.fn();
    const onCommit = vi.fn();
    render(
      <SwipeRow left={action('Delete', 'danger', onCommit)}>
        <button type="button" onClick={onRowClick}>
          Bench Press
        </button>
      </SwipeRow>,
    );
    const row = screen.getByText('Bench Press');
    const surface = row.parentElement;
    if (surface === null) throw new Error('no surface');

    swipe(surface, -40);
    fireEvent.click(row);
    expect(onRowClick).not.toHaveBeenCalled();

    // Only the swipe's own click is swallowed; the next one works.
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledOnce();
  });
});
