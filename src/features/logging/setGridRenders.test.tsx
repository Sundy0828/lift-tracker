// @vitest-environment jsdom
// Renders the set grid. The suite defaults to node; see vite.config.ts.
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LoggedSet, SessionEntry } from '@/domain/sessions';
import { emptySet, updateSet } from '@/domain/sessions';
import type { Unit } from '@/domain/types';
import { DEFAULT_PRESCRIPTION } from '@/domain/workouts';
import { EntryCard } from './EntryCard';
import type { NumberField as NumberFieldComponent } from './NumberField';

/**
 * The set grid is the hot path, and §3 states what it must not do: typing a
 * rep count must not re-render sibling set rows.
 *
 * Two separate claims, and both are cheap to break by accident. Typing renders
 * the row once, when the box stops being empty and the missing-number note has
 * to change; every later keystroke renders nothing, because the inputs stay
 * uncontrolled. Committing re-renders one row, because `SetRow` is memoized on
 * primitives and every handler is stable — one object prop rebuilt per render,
 * or one handler without a `useCallback`, and all fifty rows re-render on
 * every entry instead.
 *
 * Neither shows up as a failing assertion anywhere else. The symptom is a
 * screen that gets slower the longer the workout, on the device least able to
 * absorb it.
 */

/** Counts renders per field. Hoisted, so the mock factory can reach it. */
const { fieldRenders } = vi.hoisted(() => ({ fieldRenders: new Map<string, number>() }));

/**
 * Mocking the field rather than the row is what makes this measurable:
 * wrapping `SetRow` would put an unmemoized component in front of the `memo`
 * under test and every row would look like it re-rendered. `NumberField` is a
 * leaf, so counting it counts renders of the row that owns it.
 */
vi.mock('./NumberField', async (importOriginal) => {
  const actual = await importOriginal<{ NumberField: typeof NumberFieldComponent }>();
  return {
    NumberField: (props: Parameters<typeof NumberFieldComponent>[0]) => {
      fieldRenders.set(props.label, (fieldRenders.get(props.label) ?? 0) + 1);
      return <actual.NumberField {...props} />;
    },
  };
});

function entryWith(sets: LoggedSet[]): SessionEntry {
  return {
    slotId: 'slot-bench',
    kind: 'exercise',
    exerciseId: 'bench',
    exerciseName: 'Bench Press',
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION, sets: sets.length },
    sets,
    supersetGroup: null,
    notes: '',
  };
}

/**
 * The screen's own wiring, reduced to one entry: state that a commit updates,
 * and handlers that never change identity. `ActiveSessionScreen` gets the
 * stability from a ref instead; here the updater form does it, which is the
 * same guarantee with less machinery.
 */
function Harness() {
  const [entry, setEntry] = useState(() => entryWith([emptySet(0), emptySet(1), emptySet(2)]));

  const onWeight = useCallback(
    (key: string, setIndex: number, value: number | null, unit: Unit) => {
      setEntry((previous) => {
        const [updated] = updateSet([previous], key, setIndex, {
          weight: value === null ? null : { value, unit },
        });
        return updated ?? previous;
      });
    },
    [],
  );

  const onReps = useCallback((key: string, setIndex: number, value: number | null) => {
    setEntry((previous) => {
      const [updated] = updateSet([previous], key, setIndex, { reps: value });
      return updated ?? previous;
    });
  }, []);

  const noop = useCallback(() => undefined, []);

  return (
    <EntryCard
      entry={entry}
      displayUnit="lb"
      handedness="right"
      workoutStats={null}
      exerciseStats={null}
      workoutName="PUSH"
      onWeight={onWeight}
      onReps={onReps}
      onRir={noop}
      onToggleComplete={noop}
      onToggleSkipped={noop}
      onToggleWarmup={noop}
      onNotes={noop}
      onRemoveEntry={null}
    />
  );
}

/** Renders counted since the last call, by field label. */
function since(baseline: Map<string, number>): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const [label, count] of fieldRenders) {
    const before = baseline.get(label) ?? 0;
    if (count > before) delta[label] = count - before;
  }
  return delta;
}

describe('the set grid on keystroke', () => {
  it('renders its own row once as a rep count is typed, not once per keystroke', () => {
    fieldRenders.clear();
    render(
      <MantineProvider>
        <Harness />
      </MantineProvider>,
    );
    const baseline = new Map(fieldRenders);

    // The first digit fills an empty box, so the row's missing-number note
    // changes and the row renders. Nothing belonging to set 2 or set 3 does.
    const reps = screen.getByRole('spinbutton', { name: 'Set 1 reps' });
    fireEvent.change(reps, { target: { value: '8' } });
    expect(since(baseline)).toEqual({ 'Set 1 weight': 1, 'Set 1 reps': 1 });

    // Every digit after it changes nothing the row shows.
    const typed = new Map(fieldRenders);
    fireEvent.change(reps, { target: { value: '9' } });
    fireEvent.change(reps, { target: { value: '10' } });
    expect(since(typed)).toEqual({});
  });

  it('re-renders only the committed row, not its siblings', () => {
    fieldRenders.clear();
    render(
      <MantineProvider>
        <Harness />
      </MantineProvider>,
    );
    const reps = screen.getByRole('spinbutton', { name: 'Set 1 reps' });
    fireEvent.change(reps, { target: { value: '9' } });

    // Measured over the commit alone: filling an empty box has already
    // rendered the row once, and that is the test above.
    const baseline = new Map(fieldRenders);
    fireEvent.blur(reps);

    // Set 1's own fields, and nothing belonging to set 2 or set 3.
    expect(since(baseline)).toEqual({ 'Set 1 weight': 1, 'Set 1 reps': 1 });
  });

  it('keeps sibling rows out of it however many sets are committed', () => {
    fieldRenders.clear();
    render(
      <MantineProvider>
        <Harness />
      </MantineProvider>,
    );

    for (const ordinal of [1, 2, 3]) {
      const weight = screen.getByRole('spinbutton', { name: `Set ${String(ordinal)} weight` });
      fireEvent.change(weight, { target: { value: '185' } });
      const baseline = new Map(fieldRenders);
      fireEvent.blur(weight);

      expect(since(baseline)).toEqual({
        [`Set ${String(ordinal)} weight`]: 1,
        [`Set ${String(ordinal)} reps`]: 1,
      });
    }
  });
});
