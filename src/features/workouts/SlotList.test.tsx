// @vitest-environment jsdom
// Renders and drives real rows. The suite defaults to node; see vite.config.ts.
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExerciseSlot, WorkoutBody } from '@/domain/workouts';
import { DEFAULT_PRESCRIPTION, createRestSlot, linkToPrevious } from '@/domain/workouts';
import { SlotList } from './SlotList';

/**
 * The wiring between a row's gestures and the callbacks the editor acts on.
 *
 * `SwipeRow.test.tsx` proves the gesture maths; this proves the gesture is
 * actually connected, and connected to the right handler — the case that
 * matters most being a circuit with no room to drag out of.
 */

function slot(slotId: string, exerciseName: string): ExerciseSlot {
  return {
    slotId,
    kind: 'exercise',
    exerciseId: exerciseName.toLowerCase(),
    exerciseName,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION },
    supersetGroup: null,
    notes: '',
  };
}

/** The user's case: two exercises, and the whole workout is one circuit. */
function allCircuit(): WorkoutBody {
  const pair = [slot('a', 'Pushups'), slot('b', 'Crunches')];
  return { name: 'PAIR', slots: linkToPrevious(pair, 'b', 'g1'), groupRest: {} };
}

const handlers = () => ({
  onReorder: vi.fn(),
  onEditSlot: vi.fn(),
  onRemoveSlot: vi.fn(),
  onGroup: vi.fn(),
  onLeaveCircuit: vi.fn(),
  onAddAfter: vi.fn(),
  onAddRestAfter: vi.fn(),
  onRounds: vi.fn(),
  onGroupRest: vi.fn(),
  onRestSeconds: vi.fn(),
});

function setup(workout: WorkoutBody) {
  const props = handlers();
  render(
    <MantineProvider>
      <SlotList workout={workout} defaultRestSeconds={120} {...props} />
    </MantineProvider>,
  );
  return props;
}

/** The sliding surface for a named row: the swipe listeners live on it. */
function surfaceOf(name: string): Element {
  const label = screen.getByText(name);
  // slot-name Text -> button -> .body -> .rowInner -> .surface
  const surface = label.closest('button')?.parentElement?.parentElement?.parentElement;
  if (surface == null) throw new Error(`no surface for ${name}`);
  return surface;
}

function swipe(surface: Element, dx: number): void {
  fireEvent.pointerDown(surface, { clientX: 200, clientY: 50, pointerId: 1, button: 0 });
  fireEvent.pointerMove(surface, {
    clientX: 200 + Math.sign(dx) * 20,
    clientY: 50,
    pointerId: 1,
  });
  fireEvent.pointerMove(surface, { clientX: 200 + dx, clientY: 50, pointerId: 1 });
  fireEvent.pointerUp(surface, { pointerId: 1 });
}

describe('leaving a circuit by swiping right', () => {
  it('is wired up for a workout that is entirely one circuit', () => {
    const props = setup(allCircuit());
    expect(screen.getByTestId('circuit-block')).toBeInTheDocument();

    swipe(surfaceOf('Crunches'), 140);

    // A swipe has no vertical hint, so a member that is not the first leaves
    // on the side it already reads as: below the block.
    expect(props.onLeaveCircuit).toHaveBeenCalledWith('b', false);
    expect(props.onRemoveSlot).not.toHaveBeenCalled();
  });

  it('sends the first member out above the block instead', () => {
    const props = setup(allCircuit());
    swipe(surfaceOf('Pushups'), 140);
    expect(props.onLeaveCircuit).toHaveBeenCalledWith('a', true);
  });

  it('still deletes when swiped the other way', () => {
    const props = setup(allCircuit());
    swipe(surfaceOf('Crunches'), -140);

    expect(props.onRemoveSlot).toHaveBeenCalledWith('b');
    expect(props.onLeaveCircuit).not.toHaveBeenCalled();
  });

  it('is not offered for a row outside a circuit', () => {
    const props = setup({
      name: 'PLAIN',
      slots: [slot('a', 'Pushups'), slot('b', 'Crunches')],
      groupRest: {},
    });

    swipe(surfaceOf('Crunches'), 140);
    expect(props.onLeaveCircuit).not.toHaveBeenCalled();
  });
});

describe('the insert row below a circuit', () => {
  it('adds outside the block rather than joining it', () => {
    const props = setup(allCircuit());

    fireEvent.click(screen.getByRole('button', { name: 'Add an exercise after the circuit' }));
    // Anchored to the last member, but explicitly not joining.
    expect(props.onAddAfter).toHaveBeenCalledWith('b', false);
  });

  it('offers a rest after the block too', () => {
    const props = setup(allCircuit());

    fireEvent.click(screen.getByRole('button', { name: 'Add a rest after the circuit' }));
    expect(props.onAddRestAfter).toHaveBeenCalledWith('b', false);
  });

  it('keeps joining for the rows inside the block', () => {
    const props = setup(allCircuit());

    fireEvent.click(
      screen.getByRole('button', { name: 'Add an exercise after Pushups, in the circuit' }),
    );
    expect(props.onAddAfter).toHaveBeenCalledWith('a', true);
  });

  it('adds at the start from the row above the first exercise', () => {
    const props = setup(allCircuit());

    fireEvent.click(screen.getByRole('button', { name: 'Add an exercise at the start' }));
    expect(props.onAddAfter).toHaveBeenCalledWith(null, true);
  });
});

describe('rest rows', () => {
  it('are named as rest, not by a catalog name', () => {
    const rest = createRestSlot('r1', 45);
    setup({ name: 'ABS', slots: [slot('a', 'Pushups'), rest], groupRest: {} });

    expect(screen.getByRole('button', { name: 'Add an exercise after rest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete rest' })).toBeInTheDocument();
  });
});
