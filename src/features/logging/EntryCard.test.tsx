// @vitest-environment jsdom
// Renders the set grid. The suite defaults to node; see vite.config.ts.
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExerciseStats, WorkoutStats } from '@/domain/overlay';
import { buildStatsUpdate } from '@/domain/overlay';
import type { LoggedSet, Session, SessionEntry } from '@/domain/sessions';
import { emptySet, newSession } from '@/domain/sessions';
import type { ExerciseSlot } from '@/domain/workouts';
import { DEFAULT_PRESCRIPTION } from '@/domain/workouts';
import { EntryCard } from './EntryCard';
import { SessionClock } from './SessionClock';

/**
 * That the two overlay tiers actually reach the screen looking different.
 *
 * `overlay.test.ts` proves the resolution; this proves the distinction
 * survives into the UI — because the whole point of the second tier is that it
 * is *visibly* not a progression comparison. A tier-2 number rendered with a
 * delta chip would be the exact failure §2.6 exists to prevent.
 */

function slot(slotId: string, exerciseId: string, sets = 2): ExerciseSlot {
  return {
    slotId,
    kind: 'exercise',
    exerciseId,
    exerciseName: exerciseId === 'bench' ? 'Bench Press' : exerciseId,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION, sets },
    supersetGroup: null,
    notes: '',
  };
}

function set(setIndex: number, weight: number, reps: number, rir: number): LoggedSet {
  return {
    ...emptySet(setIndex),
    weight: { value: weight, unit: 'lb' },
    reps,
    rir,
    completedAt: '2025-08-24T18:00:00.000Z',
  };
}

/** A session with the shape the screen would hand around. */
function session(workoutId: string | null, workoutName: string): Session {
  return newSession({
    sessionId: 's1',
    workoutId,
    workoutVersion: 1,
    workoutName,
    body: { name: workoutName, slots: [slot('slot-bench', 'bench')], groupRest: {} },
    performedOn: '2025-08-24',
    startedAt: '2025-08-24T17:00:00.000Z',
  });
}

/** A finished session, and the stats documents it would have written. */
function history(workoutId: string | null, workoutName: string, sets: LoggedSet[]) {
  const session: Session = newSession({
    sessionId: 's1',
    workoutId,
    workoutVersion: 1,
    workoutName,
    body: { name: workoutName, slots: [slot('slot-bench', 'bench')], groupRest: {} },
    performedOn: '2025-08-24',
    startedAt: '2025-08-24T17:00:00.000Z',
  });

  const logged: Session = {
    ...session,
    entries: session.entries.map((entry) => ({ ...entry, sets })),
  };
  return buildStatsUpdate(logged, () => null);
}

const handlers = () => ({
  onNotes: vi.fn(),
  onRemoveEntry: null,
  onWeight: vi.fn(),
  onReps: vi.fn(),
  onRir: vi.fn(),
  onToggleComplete: vi.fn(),
  onToggleSkipped: vi.fn(),
  onToggleWarmup: vi.fn(),
});

function setup(
  entry: SessionEntry,
  workoutStats: WorkoutStats | null,
  exerciseStats: ExerciseStats | null,
  workoutName = 'PUSH',
) {
  const props = handlers();
  render(
    <MantineProvider>
      <EntryCard
        entry={entry}
        displayUnit="lb"
        workoutStats={workoutStats}
        exerciseStats={exerciseStats}
        workoutName={workoutName}
        {...props}
      />
    </MantineProvider>,
  );
  return props;
}

/** Today's session: two prescribed sets, the first already filled in. */
function todaysEntry(first: LoggedSet | null = set(0, 190, 8, 2)): SessionEntry {
  return {
    slotId: 'slot-bench',
    kind: 'exercise',
    exerciseId: 'bench',
    exerciseName: 'Bench Press',
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION, sets: 2 },
    sets: [first ?? emptySet(0), emptySet(1)],
    supersetGroup: null,
    notes: '',
  };
}

describe('tier 1 — the same workout', () => {
  const push = history('push', 'PUSH', [set(0, 185, 8, 2), set(1, 185, 7, 1)]);

  it('names the workout and shows last time numbers per set', () => {
    setup(todaysEntry(), push.workoutStats, null);

    expect(screen.getByText('Last')).toBeInTheDocument();
    expect(screen.getByText('PUSH')).toBeInTheDocument();
    expect(screen.getByText('185 lb × 8 @ 2 RIR')).toBeInTheDocument();
    expect(screen.getByText('185 lb × 7 @ 1 RIR')).toBeInTheDocument();
  });

  it('shows a delta chip for the set that has been entered', () => {
    setup(todaysEntry(), push.workoutStats, null);
    expect(screen.getByTestId('set-delta')).toHaveTextContent('+5 lb');
  });

  /**
   * The reported bug: 45x15 becoming 50x12 used to read as a bare "+5 lb",
   * which hid the three reps that were the other half of the trade-off.
   */
  it('names both axes when load and reps both moved', () => {
    const heavier = history('push', 'PUSH', [set(0, 45, 15, 2)]);
    setup(todaysEntry(set(0, 50, 12, 2)), heavier.workoutStats, null);

    expect(screen.getByTestId('set-delta')).toHaveTextContent('+5 lb · −3 reps');
  });

  it('shows no delta on a set that has not been entered yet', () => {
    setup(todaysEntry(null), push.workoutStats, null);

    // Last time's numbers still overlay both rows; nothing is compared.
    expect(screen.getByText('185 lb × 8 @ 2 RIR')).toBeInTheDocument();
    expect(screen.queryAllByTestId('set-delta')).toHaveLength(0);
  });

  it('carries no NEW badge', () => {
    setup(todaysEntry(), push.workoutStats, null);
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });
});

describe('tier 2 — the same lift on another day', () => {
  /** Bench has only ever been done on PUSH; today is CHEST + DELTS. */
  const anywhere = history('push', 'PUSH', [set(0, 205, 6, 1)]).exerciseStats.get('bench') ?? null;

  it('labels where the number came from', () => {
    setup(todaysEntry(), null, anywhere, 'CHEST + DELTS');

    expect(screen.getByText('PUSH')).toBeInTheDocument();
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('is tagged as a reference rather than a comparison', () => {
    setup(todaysEntry(), null, anywhere, 'CHEST + DELTS');
    expect(screen.getByText('reference')).toBeInTheDocument();
  });

  /** The load hint is useful; a delta against another day type is not. */
  it('shows last time numbers but no delta chip', () => {
    setup(todaysEntry(), null, anywhere, 'CHEST + DELTS');

    expect(screen.getByText('205 lb × 6 @ 1 RIR')).toBeInTheDocument();
    expect(screen.queryAllByTestId('set-delta')).toHaveLength(0);
  });
});

describe('tier 3 — new', () => {
  it('badges an exercise with no history anywhere', () => {
    setup(todaysEntry(), null, null);

    expect(screen.getByText('NEW')).toBeInTheDocument();
    expect(screen.getByText(/no history to compare against/)).toBeInTheDocument();
    expect(screen.queryByText(/lb ×/)).not.toBeInTheDocument();
  });
});

describe('warmups', () => {
  const push = history('push', 'PUSH', [set(0, 185, 8, 2), set(1, 185, 7, 1)]);

  it('are lettered, overlay nothing, and do not shift the working sets', () => {
    const entry: SessionEntry = {
      ...todaysEntry(),
      sets: [{ ...set(0, 95, 10, 6), isWarmup: true }, set(1, 190, 8, 2), emptySet(2)],
    };
    setup(entry, push.workoutStats, null);

    expect(screen.getByRole('button', { name: 'Set W, warmup' })).toBeInTheDocument();
    // The working set is still set 1, and still compares against last time's
    // first working set rather than being pushed onto its second.
    expect(screen.getByRole('spinbutton', { name: 'Set 1 weight' })).toBeInTheDocument();
    const deltas = screen.getAllByTestId('set-delta');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toHaveTextContent('+5 lb');
  });
});

describe('the inputs', () => {
  it('commit on blur, not per keystroke', () => {
    const props = setup(todaysEntry(null), null, null);
    const reps = screen.getByRole('spinbutton', { name: 'Set 1 reps' });

    fireEvent.change(reps, { target: { value: '9' } });
    expect(props.onReps).not.toHaveBeenCalled();

    fireEvent.blur(reps);
    expect(props.onReps).toHaveBeenCalledWith('slot-bench', 0, 9);
  });

  it('commit immediately on a stepper press', () => {
    const props = setup(todaysEntry(null), null, null);

    fireEvent.click(screen.getByRole('button', { name: 'Set 1 weight up' }));
    // Stepping up from empty starts at the minimum, which for a load is zero.
    expect(props.onWeight).toHaveBeenCalledWith('slot-bench', 0, 0, 'lb');
  });

  it('reports a cleared field as null rather than zero', () => {
    const props = setup(todaysEntry(), null, null);
    const reps = screen.getByRole('spinbutton', { name: 'Set 1 reps' });

    fireEvent.change(reps, { target: { value: '' } });
    fireEvent.blur(reps);
    expect(props.onReps).toHaveBeenCalledWith('slot-bench', 0, null);
  });
});

describe('a rest row', () => {
  it('renders as a pause, with no sets to log', () => {
    const rest: SessionEntry = {
      slotId: 'slot-rest',
      kind: 'rest',
      exerciseId: '__rest__',
      exerciseName: 'Rest',
      occurrenceIndex: 0,
      prescription: { ...DEFAULT_PRESCRIPTION, restSeconds: 90 },
      sets: [],
      supersetGroup: null,
      notes: '',
    };
    setup(rest, null, null);

    expect(screen.getByText('Rest')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });
});

describe('a long workout name', () => {
  const push = history('push', 'PUSH', [set(0, 185, 8, 2)]);

  /**
   * The name is the only part allowed to shrink, so the date — the part that
   * changes between sessions — is never what gets clipped.
   */
  it('keeps the date on the line and leaves the name to truncate', () => {
    const long = 'CHEST + FRONT DELTS + TRICEPS ACCESSORY BLOCK';
    setup(todaysEntry(), push.workoutStats, null, long);

    const name = screen.getByText(long);
    expect(name).toBeInTheDocument();
    expect(screen.getByText(/^· /)).toBeInTheDocument();
  });

  it('does not read as an empty name when the workout is unnamed', () => {
    setup(todaysEntry(), push.workoutStats, null, '');
    expect(screen.getByText('an unnamed workout')).toBeInTheDocument();
  });
});

describe('effort', () => {
  it('offers four tap targets instead of a typed number', () => {
    setup(todaysEntry(null), null, null);

    expect(screen.getByRole('group', { name: /Set 1 effort/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Set 1: to failure, no reps left' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set 1: 3 or more reps left' })).toBeInTheDocument();
  });

  it('stores the plain RIR number behind the button', () => {
    const props = setup(todaysEntry(null), null, null);

    fireEvent.click(screen.getByRole('button', { name: 'Set 1: 2 reps left' }));
    expect(props.onRir).toHaveBeenCalledWith('slot-bench', 0, 2);
  });

  it('clears the value when the chosen one is tapped again', () => {
    const props = setup(todaysEntry(), null, null);

    // The seeded set is 2 RIR, so its own button is the selected one.
    fireEvent.click(screen.getByRole('button', { name: 'Set 1: 2 reps left' }));
    expect(props.onRir).toHaveBeenCalledWith('slot-bench', 0, null);
  });

  it('marks the prescribed range on the control', () => {
    setup(todaysEntry(null), null, null);

    // DEFAULT_PRESCRIPTION targets 1-2 RIR.
    expect(screen.getByRole('button', { name: 'Set 1: 1 rep left' })).toHaveAttribute(
      'data-target',
    );
    expect(
      screen.getByRole('button', { name: 'Set 1: to failure, no reps left' }),
    ).not.toHaveAttribute('data-target');
  });
});

describe('rep range', () => {
  /** Colour is never the only signal: the note names the range it missed. */
  it('flags a set short of the range, in words as well as colour', () => {
    const entry: SessionEntry = { ...todaysEntry(set(0, 190, 6, 2)) };
    setup(entry, null, null);

    expect(screen.getByTestId('set-note')).toHaveTextContent('under 8-12');
  });

  it('flags a set past the range', () => {
    setup(todaysEntry(set(0, 190, 15, 2)), null, null);
    expect(screen.getByTestId('set-note')).toHaveTextContent('over 8-12');
  });

  it('says nothing about a set inside the range', () => {
    setup(todaysEntry(set(0, 190, 10, 2)), null, null);
    expect(screen.queryByTestId('set-note')).not.toBeInTheDocument();
  });

  it('says nothing about a set that has not been done yet', () => {
    setup(todaysEntry(null), null, null);
    expect(screen.queryByTestId('set-note')).not.toBeInTheDocument();
  });
});

describe('the prescription is the plan', () => {
  it('offers no way to add or delete a set', () => {
    setup(todaysEntry(), null, null);

    expect(screen.queryByRole('button', { name: /\+ Set/ })).not.toBeInTheDocument();
    expect(screen.queryByText('remove')).not.toBeInTheDocument();
    // Skipping is the way to record doing less, and it keeps the row.
    expect(screen.getAllByText('skip')).toHaveLength(2);
  });
});

describe('the session clock', () => {
  it('reports elapsed time while running', () => {
    render(
      <MantineProvider>
        <SessionClock
          session={{
            ...session('push', 'PUSH'),
            startedAt: '2025-08-24T17:00:00.000Z',
          }}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('session-clock')).toBeInTheDocument();
  });

  it('measures a finished session to its completion, not to now', () => {
    render(
      <MantineProvider>
        <SessionClock
          session={{
            ...session('push', 'PUSH'),
            status: 'completed',
            startedAt: '2025-08-24T17:00:00.000Z',
            completedAt: '2025-08-24T18:12:00.000Z',
          }}
        />
      </MantineProvider>,
    );
    expect(screen.getByTestId('session-clock')).toHaveTextContent('1 h 12 total');
  });
});
