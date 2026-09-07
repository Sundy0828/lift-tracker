import { describe, expect, it } from 'vitest';
import type { ExerciseSlot, WorkoutBody } from './workouts';
import {
  DEFAULT_PRESCRIPTION,
  MAX_SETS,
  DEFAULT_REST_SLOT_SECONDS,
  REST_SLOT_ID,
  activeGroupIds,
  createRestSlot,
  exerciseSlots,
  groupRounds,
  groupWithSlot,
  insertSlotAfter,
  linkToPrevious,
  parseWorkoutBody,
  parseGroupRest,
  pruneGroupRest,
  reconcileGroups,
  reorder,
  supersetGroups,
  isRestSlot,
  restSlotSeconds,
  totalSets,
  ungroup,
  unlink,
  withGroupRounds,
} from './workouts';
import { workoutVolume, type MuscleLookup } from './volume';

/**
 * Circuits: a contiguous run of slots sharing a `supersetGroup`, run for a
 * number of rounds. The shape behind "20 push-ups, 20 crunches, 5 pull-ups,
 * three times through".
 */

function slot(overrides: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return {
    slotId: 's',
    kind: 'exercise',
    exerciseId: 'x',
    exerciseName: 'X',
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION },
    supersetGroup: null,
    notes: '',
    ...overrides,
  };
}

function asWorkout(slots: ExerciseSlot[]): WorkoutBody {
  return { name: 'W', slots, groupRest: {} };
}

/** Warm-up, then the three-exercise circuit from the brief. */
function base(): ExerciseSlot[] {
  return [
    slot({ slotId: 'warm', exerciseId: 'warmup', exerciseName: 'Warm-up' }),
    slot({ slotId: 'a', exerciseId: 'pushup', exerciseName: 'Push-ups' }),
    slot({ slotId: 'b', exerciseId: 'crunch', exerciseName: 'Crunches' }),
    slot({ slotId: 'c', exerciseId: 'pullup', exerciseName: 'Pull-ups' }),
  ];
}

const find = (slots: readonly ExerciseSlot[], slotId: string): ExerciseSlot | undefined =>
  slots.find((item) => item.slotId === slotId);

describe('linkToPrevious', () => {
  it('starts a group from two adjacent slots', () => {
    const linked = linkToPrevious(base(), 'b', 'g1');
    expect(find(linked, 'a')?.supersetGroup).toBe('g1');
    expect(find(linked, 'b')?.supersetGroup).toBe('g1');
    expect(find(linked, 'warm')?.supersetGroup).toBeNull();
  });

  it('joins the existing group rather than minting a second one', () => {
    // The bug this replaces: the old switch minted a fresh id on every toggle,
    // so two adjacent slots could never end up in the same group.
    let slots = linkToPrevious(base(), 'b', 'g1');
    slots = linkToPrevious(slots, 'c', 'g2-unused');

    const groups = new Set(
      slots.filter((item) => item.supersetGroup !== null).map((item) => item.supersetGroup),
    );
    expect(groups).toEqual(new Set(['g1']));
  });

  it('drops the joined slot rest to 0 so the round flows straight through', () => {
    const linked = linkToPrevious(base(), 'b', 'g1');
    expect(find(linked, 'b')?.prescription.restSeconds).toBe(0);
  });

  it('takes its round count from the slot above', () => {
    const slots = base().map((item) =>
      item.slotId === 'a' ? { ...item, prescription: { ...item.prescription, sets: 5 } } : item,
    );
    expect(find(linkToPrevious(slots, 'b', 'g1'), 'b')?.prescription.sets).toBe(5);
  });

  it('does nothing for the first slot, which has nothing above it', () => {
    const slots = base();
    expect(linkToPrevious(slots, 'warm', 'g1')).toEqual(slots);
  });

  it('does nothing for an unknown slot', () => {
    const slots = base();
    expect(linkToPrevious(slots, 'nope', 'g1')).toEqual(slots);
  });

  it('leaves the input array alone', () => {
    const slots = base();
    linkToPrevious(slots, 'b', 'g1');
    expect(find(slots, 'b')?.supersetGroup).toBeNull();
  });
});

describe('unlink', () => {
  const threeMemberCircuit = (): ExerciseSlot[] =>
    linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g1');

  it('removes one member and restores its default rest', () => {
    const slots = unlink(threeMemberCircuit(), 'c');
    expect(find(slots, 'c')?.supersetGroup).toBeNull();
    expect(find(slots, 'c')?.prescription.restSeconds).toBeNull();
    expect(find(slots, 'a')?.supersetGroup).toBe('g1');
    expect(find(slots, 'b')?.supersetGroup).toBe('g1');
  });

  it('dissolves a group left with one member, since a circuit of one is an exercise', () => {
    const slots = unlink(linkToPrevious(base(), 'b', 'g1'), 'b');
    expect(slots.every((item) => item.supersetGroup === null)).toBe(true);
    expect(find(slots, 'a')?.prescription.restSeconds).toBeNull();
  });

  it('does nothing for a slot that is not grouped', () => {
    const slots = base();
    expect(unlink(slots, 'warm')).toEqual(slots);
  });

  it('is the only way out when the whole workout is one circuit', () => {
    // Two exercises, both in the circuit: there is no position outside the
    // block to drag to, so reordering can never leave it. This is why the
    // swipe-right gesture exists.
    const pair = [slot({ slotId: 'a' }), slot({ slotId: 'b', exerciseId: 'row' })];
    const circuit = linkToPrevious(pair, 'b', 'g1');
    expect(circuit.every((item) => item.supersetGroup === 'g1')).toBe(true);

    // Any reorder keeps them adjacent, so the group survives reconciliation.
    expect(reconcileGroups(reorder(circuit, 1, 0)).every((i) => i.supersetGroup === 'g1')).toBe(
      true,
    );

    // unlink dissolves it, because a circuit of one is just an exercise.
    const out = unlink(circuit, 'b');
    expect(out.every((item) => item.supersetGroup === null)).toBe(true);
  });
});

describe('ungroup', () => {
  it('takes a whole circuit apart and restores every default rest', () => {
    const circuit = linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g1');
    const slots = ungroup(circuit, 'g1');

    expect(slots.every((item) => item.supersetGroup === null)).toBe(true);
    for (const id of ['a', 'b', 'c']) {
      expect(find(slots, id)?.prescription.restSeconds).toBeNull();
    }
  });

  it('leaves other groups and loose slots alone', () => {
    const two = linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g2');
    const slots = ungroup(two, 'g1');

    expect(find(slots, 'a')?.supersetGroup).toBeNull();
    expect(find(slots, 'b')?.supersetGroup).toBeNull();
    expect(find(slots, 'warm')?.supersetGroup).toBeNull();
  });

  it('does nothing for an unknown group', () => {
    const circuit = linkToPrevious(base(), 'b', 'g1');
    expect(ungroup(circuit, 'nope')).toEqual(circuit);
  });

  it('keeps a rest row inside it a rest row, with its length', () => {
    const withRest = insertSlotAfter(
      linkToPrevious(base(), 'b', 'g1'),
      'a',
      createRestSlot('r1', 30),
    );
    const slots = ungroup(withRest, 'g1');
    const rest = find(slots, 'r1');

    expect(rest?.supersetGroup).toBeNull();
    expect(restSlotSeconds(rest ?? createRestSlot('x', 0))).toBe(30);
  });
});

describe('groupRounds', () => {
  it('reports the shared set count', () => {
    const slots = linkToPrevious(base(), 'b', 'g1');
    const members = slots.filter((item) => item.supersetGroup === 'g1');
    expect(groupRounds(members)).toBe(DEFAULT_PRESCRIPTION.sets);
  });

  it('reports null when members disagree, as an imported workout can', () => {
    expect(
      groupRounds([
        slot({ slotId: 'a', prescription: { ...DEFAULT_PRESCRIPTION, sets: 3 } }),
        slot({ slotId: 'b', prescription: { ...DEFAULT_PRESCRIPTION, sets: 4 } }),
      ]),
    ).toBeNull();
  });

  it('reports null for no members', () => {
    expect(groupRounds([])).toBeNull();
  });
});

describe('withGroupRounds', () => {
  it('writes the round count to every member and nothing outside the group', () => {
    const slots = withGroupRounds(linkToPrevious(base(), 'b', 'g1'), 'g1', 4);
    expect(find(slots, 'a')?.prescription.sets).toBe(4);
    expect(find(slots, 'b')?.prescription.sets).toBe(4);
    expect(find(slots, 'warm')?.prescription.sets).toBe(DEFAULT_PRESCRIPTION.sets);
  });

  it('clamps to the set cap', () => {
    const slots = withGroupRounds(linkToPrevious(base(), 'b', 'g1'), 'g1', 999);
    expect(find(slots, 'a')?.prescription.sets).toBe(MAX_SETS);
  });

  it('lines up members that disagreed', () => {
    const mixed = linkToPrevious(base(), 'b', 'g1').map((item) =>
      item.slotId === 'b' ? { ...item, prescription: { ...item.prescription, sets: 7 } } : item,
    );
    const fixed = withGroupRounds(mixed, 'g1', 3);
    expect(groupRounds(fixed.filter((item) => item.supersetGroup === 'g1'))).toBe(3);
  });
});

describe('a circuit and the volume math', () => {
  const MUSCLES: Record<string, { primaryMuscles: ['chest']; secondaryMuscles: [] }> = {
    pushup: { primaryMuscles: ['chest'], secondaryMuscles: [] },
  };
  const lookup: MuscleLookup = (id) => MUSCLES[id] ?? null;

  it('counts each member once per round', () => {
    // Supersets change rest, not work: 3 rounds means 3 sets of each member.
    const slots = withGroupRounds(
      linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g1'),
      'g1',
      3,
    );
    const members = slots.filter((item) => item.supersetGroup === 'g1');
    expect(members).toHaveLength(3);
    expect(members.every((item) => item.prescription.sets === 3)).toBe(true);

    // Push-ups appear once in the circuit at 3 rounds, so 3 set-equivalents.
    expect(workoutVolume(asWorkout(slots), lookup).get('chest')).toBe(3);
  });

  it('totals the workout as warm-up plus every round of every member', () => {
    const slots = withGroupRounds(
      linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g1'),
      'g1',
      3,
    );
    expect(totalSets(asWorkout(slots))).toBe(DEFAULT_PRESCRIPTION.sets + 3 * 3);
  });
});

describe('activeGroupIds', () => {
  it('lists only groups with more than one member', () => {
    expect(activeGroupIds(linkToPrevious(base(), 'b', 'g1'))).toEqual(['g1']);
    expect(activeGroupIds([slot({ slotId: 'x', supersetGroup: 'lonely' })])).toEqual([]);
    expect(activeGroupIds(base())).toEqual([]);
  });
});

describe('pruneGroupRest', () => {
  it('keeps the rest of a live group', () => {
    const slots = linkToPrevious(base(), 'b', 'g1');
    expect(pruneGroupRest({ ...asWorkout(slots), groupRest: { g1: 30 } }).groupRest).toEqual({
      g1: 30,
    });
  });

  it('drops the rest of a group that no longer exists', () => {
    // Otherwise a later circuit reusing the id would inherit a stale pause.
    expect(
      pruneGroupRest({ ...asWorkout(base()), groupRest: { g1: 30, g2: null } }).groupRest,
    ).toEqual({});
  });
});

describe('parseGroupRest', () => {
  it('keeps numbers and explicit nulls', () => {
    expect(parseGroupRest({ g1: 30, g2: null })).toEqual({ g1: 30, g2: null });
  });

  it('drops unusable keys and values', () => {
    expect(parseGroupRest({ g1: 'x', '': 5, g2: 45 })).toEqual({ g2: 45 });
  });

  it('clamps out-of-range values', () => {
    expect(parseGroupRest({ g1: -5, g2: 99999 })).toEqual({ g1: 0, g2: 3600 });
  });

  it('returns empty for a non-object', () => {
    for (const value of [null, undefined, [], 'x', 7]) {
      expect(parseGroupRest(value)).toEqual({});
    }
  });
});

describe('supersetGroups over a real circuit', () => {
  it('keeps the warm-up separate and the circuit together, in order', () => {
    const slots = linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g1');
    expect(
      supersetGroups(asWorkout(slots)).map((group) => group.map((item) => item.slotId)),
    ).toEqual([['warm'], ['a', 'b', 'c']]);
  });
});

describe('groupWithSlot', () => {
  it('groups two slots that are not adjacent, moving the dragged one', () => {
    // Drag Pull-ups (last) onto Push-ups (second): it lands directly after.
    const slots = groupWithSlot(base(), 'c', 'a', 'g1');
    expect(slots.map((item) => item.slotId)).toEqual(['warm', 'a', 'c', 'b']);
    expect(find(slots, 'a')?.supersetGroup).toBe('g1');
    expect(find(slots, 'c')?.supersetGroup).toBe('g1');
    expect(find(slots, 'b')?.supersetGroup).toBeNull();
  });

  it('appends to an existing circuit, after its last member', () => {
    const two = linkToPrevious(base(), 'b', 'g1');
    const three = groupWithSlot(two, 'warm', 'a', 'unused');

    expect(three.map((item) => item.slotId)).toEqual(['a', 'b', 'warm', 'c']);
    expect(find(three, 'warm')?.supersetGroup).toBe('g1');
  });

  it('adopts the target round count and drops its own rest', () => {
    const slots = base().map((item) =>
      item.slotId === 'a' ? { ...item, prescription: { ...item.prescription, sets: 5 } } : item,
    );
    const grouped = groupWithSlot(slots, 'c', 'a', 'g1');
    expect(find(grouped, 'c')?.prescription.sets).toBe(5);
    expect(find(grouped, 'c')?.prescription.restSeconds).toBe(0);
  });

  it('never nests: a member of one circuit moves into the other', () => {
    // Two circuits, then drag a member of the second onto the first.
    let slots = linkToPrevious(base(), 'b', 'g1'); // a + b
    slots = [
      ...slots,
      slot({ slotId: 'd', exerciseId: 'dip', exerciseName: 'Dips' }),
      slot({ slotId: 'e', exerciseId: 'row', exerciseName: 'Rows' }),
    ];
    slots = linkToPrevious(slots, 'e', 'g2'); // d + e

    const moved = groupWithSlot(slots, 'e', 'a', 'unused');

    // e left g2 and joined g1; only ever one level of grouping.
    expect(find(moved, 'e')?.supersetGroup).toBe('g1');
    const groups = new Set(
      moved.filter((item) => item.supersetGroup !== null).map((item) => item.supersetGroup),
    );
    expect(groups).toEqual(new Set(['g1']));
    // g2 was left with one member, so it dissolved.
    expect(find(moved, 'd')?.supersetGroup).toBeNull();
    expect(find(moved, 'd')?.prescription.restSeconds).toBeNull();
  });

  it('keeps a circuit contiguous after the move', () => {
    let slots = linkToPrevious(base(), 'b', 'g1');
    slots = groupWithSlot(slots, 'c', 'a', 'unused');

    const positions = slots
      .map((item, index) => ({ index, group: item.supersetGroup }))
      .filter((item) => item.group === 'g1')
      .map((item) => item.index);
    // Indices form an unbroken run.
    expect(positions).toEqual(
      Array.from({ length: positions.length }, (_, offset) => (positions[0] ?? 0) + offset),
    );
  });

  it('does nothing when both slots are already in the same circuit', () => {
    const two = linkToPrevious(base(), 'b', 'g1');
    expect(groupWithSlot(two, 'b', 'a', 'unused')).toEqual(two);
  });

  it('does nothing for the same slot, or an unknown one', () => {
    const slots = base();
    expect(groupWithSlot(slots, 'a', 'a', 'g1')).toEqual(slots);
    expect(groupWithSlot(slots, 'nope', 'a', 'g1')).toEqual(slots);
    expect(groupWithSlot(slots, 'a', 'nope', 'g1')).toEqual(slots);
  });

  it('leaves the input array alone', () => {
    const slots = base();
    groupWithSlot(slots, 'c', 'a', 'g1');
    expect(slots.map((item) => item.slotId)).toEqual(['warm', 'a', 'b', 'c']);
    expect(find(slots, 'a')?.supersetGroup).toBeNull();
  });

  it('agrees with linkToPrevious when the target is the slot above', () => {
    const viaDrag = groupWithSlot(base(), 'b', 'a', 'g1');
    const viaButton = linkToPrevious(base(), 'b', 'g1');
    expect(viaDrag).toEqual(viaButton);
  });
});

describe('reconcileGroups', () => {
  const circuitOf = (): ExerciseSlot[] =>
    linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g1');

  it('leaves an intact circuit alone', () => {
    const slots = circuitOf();
    expect(reconcileGroups(slots)).toEqual(slots);
  });

  it('leaves a circuit alone when an outsider moves past it entirely', () => {
    // Moving the warm-up to the end does not split anything.
    const settled = reconcileGroups(reorder(circuitOf(), 0, 3));
    expect(settled.filter((item) => item.supersetGroup === 'g1')).toHaveLength(3);
  });

  it('drops a member dragged above the circuit', () => {
    // warm, a, b, c with a+b+c grouped. Move c to the very top.
    const moved = reorder(circuitOf(), 3, 0);
    const settled = reconcileGroups(moved);

    expect(find(settled, 'c')?.supersetGroup).toBeNull();
    expect(find(settled, 'c')?.prescription.restSeconds).toBeNull();
    // The rest of the circuit survives.
    expect(find(settled, 'a')?.supersetGroup).toBe('g1');
    expect(find(settled, 'b')?.supersetGroup).toBe('g1');
  });

  it('drops a member dragged below the circuit', () => {
    let slots = circuitOf();
    slots = [...slots, slot({ slotId: 'z', exerciseId: 'z', exerciseName: 'Z' })];
    // a(1) b(2) c(3) z(4) -> move a to the end.
    const settled = reconcileGroups(reorder(slots, 1, 4));

    expect(find(settled, 'a')?.supersetGroup).toBeNull();
    expect(find(settled, 'b')?.supersetGroup).toBe('g1');
    expect(find(settled, 'c')?.supersetGroup).toBe('g1');
  });

  it('dissolves the circuit when dragging out leaves one member', () => {
    const two = linkToPrevious(base(), 'b', 'g1'); // a + b
    const settled = reconcileGroups(reorder(two, 2, 0)); // move b to the top

    expect(settled.every((item) => item.supersetGroup === null)).toBe(true);
    expect(find(settled, 'a')?.prescription.restSeconds).toBeNull();
  });

  it('keeps the longest run when an outsider splits a circuit', () => {
    // a b c grouped; drop the warm-up between b and c, so the runs are [a,b]
    // and [c]. The pair wins and c is detached, rather than one group living
    // in two places.
    const settled = reconcileGroups(reorder(circuitOf(), 0, 2));

    const grouped = settled
      .filter((item) => item.supersetGroup === 'g1')
      .map((item) => item.slotId);
    expect(grouped).toEqual(['a', 'b']);
    expect(find(settled, 'c')?.supersetGroup).toBeNull();
  });

  it('never leaves one group id in two separate runs', () => {
    const settled = reconcileGroups(reorder(circuitOf(), 0, 2));
    const runs: string[] = [];
    for (const [index, item] of settled.entries()) {
      const previous = settled[index - 1]?.supersetGroup ?? null;
      if (item.supersetGroup !== null && item.supersetGroup !== previous) {
        runs.push(item.supersetGroup);
      }
    }
    expect(new Set(runs).size).toBe(runs.length);
  });

  it('is idempotent', () => {
    const once = reconcileGroups(reorder(circuitOf(), 3, 0));
    expect(reconcileGroups(once)).toEqual(once);
  });

  it('leaves a list with no groups untouched', () => {
    const slots = base();
    expect(reconcileGroups(slots)).toEqual(slots);
  });
});

describe('insertSlotAfter', () => {
  const fresh = (): ExerciseSlot =>
    slot({ slotId: 'new', exerciseId: 'dip', exerciseName: 'Dips' });

  it('inserts at the start when no anchor is given', () => {
    // What the insert row above the first exercise uses.
    const slots = insertSlotAfter(base(), null, fresh());
    expect(slots.map((item) => item.slotId)).toEqual(['new', 'warm', 'a', 'b', 'c']);
    expect(find(slots, 'new')?.supersetGroup).toBeNull();
  });

  it('adds the first exercise to an empty workout', () => {
    const slots = insertSlotAfter([], null, fresh());
    expect(slots.map((item) => item.slotId)).toEqual(['new']);
  });

  it('inserts directly after a plain slot, ungrouped', () => {
    const slots = insertSlotAfter(base(), 'a', fresh());
    expect(slots.map((item) => item.slotId)).toEqual(['warm', 'a', 'new', 'b', 'c']);
    expect(find(slots, 'new')?.supersetGroup).toBeNull();
  });

  it('joins the circuit when added after a member', () => {
    // + on a circuit member should add another member, not drop a loose
    // exercise into the middle of the block.
    const circuit = withGroupRounds(linkToPrevious(base(), 'b', 'g1'), 'g1', 4);
    const slots = insertSlotAfter(circuit, 'a', fresh());

    expect(find(slots, 'new')?.supersetGroup).toBe('g1');
    expect(find(slots, 'new')?.prescription.sets).toBe(4);
    expect(find(slots, 'new')?.prescription.restSeconds).toBe(0);
    expect(slots.map((item) => item.slotId)).toEqual(['warm', 'a', 'new', 'b', 'c']);
  });

  it('keeps the circuit contiguous when inserting mid-block', () => {
    const circuit = linkToPrevious(linkToPrevious(base(), 'b', 'g1'), 'c', 'g1');
    const slots = insertSlotAfter(circuit, 'b', fresh());

    const grouped = slots
      .map((item, index) => ({ index, group: item.supersetGroup }))
      .filter((item) => item.group === 'g1')
      .map((item) => item.index);
    expect(grouped).toEqual([1, 2, 3, 4]);
    // Still one run, so reconciling changes nothing.
    expect(reconcileGroups(slots)).toEqual(slots);
  });

  it('stays out of the circuit when join is false', () => {
    // The insert row *below* a circuit block. Without it a workout ending in a
    // circuit could only ever grow the circuit.
    const circuit = withGroupRounds(linkToPrevious(base(), 'b', 'g1'), 'g1', 4);
    const slots = insertSlotAfter(circuit, 'b', fresh(), false);

    expect(find(slots, 'new')?.supersetGroup).toBeNull();
    // Positioned after the member it was anchored to, not appended blindly.
    expect(slots.map((item) => item.slotId)).toEqual(['warm', 'a', 'b', 'new', 'c']);
    // The circuit it sat next to is untouched.
    expect(find(slots, 'a')?.supersetGroup).toBe('g1');
    expect(find(slots, 'b')?.supersetGroup).toBe('g1');
  });

  it('appends when the anchor is unknown', () => {
    const slots = insertSlotAfter(base(), 'nope', fresh());
    expect(slots.at(-1)?.slotId).toBe('new');
  });

  it('leaves the input array alone', () => {
    const slots = base();
    insertSlotAfter(slots, 'a', fresh());
    expect(slots).toHaveLength(4);
  });
});

describe('rest rows', () => {
  it('is a slot kind, not a catalog exercise', () => {
    const rest = createRestSlot('r1');
    expect(rest.kind).toBe('rest');
    expect(isRestSlot(rest)).toBe(true);
    expect(rest.exerciseId).toBe(REST_SLOT_ID);
    expect(rest.exerciseName).toBe('Rest');
    expect(restSlotSeconds(rest)).toBe(DEFAULT_REST_SLOT_SECONDS);
  });

  it('takes an explicit length, clamped', () => {
    expect(restSlotSeconds(createRestSlot('r', 30))).toBe(30);
    expect(restSlotSeconds(createRestSlot('r', -5))).toBe(0);
    expect(restSlotSeconds(createRestSlot('r', 99999))).toBe(3600);
  });

  it('contributes no volume', () => {
    const lookup: MuscleLookup = () => ({ primaryMuscles: ['chest'], secondaryMuscles: [] });
    // Even with a lookup that would answer for anything, a rest row is skipped.
    const slots = [slot({ slotId: 'a' }), createRestSlot('r1', 60)];
    const volume = workoutVolume(asWorkout(slots), lookup);
    expect(volume.get('chest')).toBe(DEFAULT_PRESCRIPTION.sets);
  });

  it('does not count towards the set total', () => {
    const slots = [slot({ slotId: 'a' }), createRestSlot('r1'), slot({ slotId: 'b' })];
    expect(totalSets(asWorkout(slots))).toBe(DEFAULT_PRESCRIPTION.sets * 2);
  });

  it('is excluded from exerciseSlots', () => {
    const slots = [slot({ slotId: 'a' }), createRestSlot('r1'), slot({ slotId: 'b' })];
    expect(exerciseSlots(slots).map((item) => item.slotId)).toEqual(['a', 'b']);
  });

  it('does not affect a circuit round count', () => {
    // Rest rows sit inside the circuit but carry no sets of their own, so the
    // rounds still come from the exercises.
    let slots = linkToPrevious(base(), 'b', 'g1');
    slots = insertSlotAfter(slots, 'a', createRestSlot('r1', 30));
    slots = withGroupRounds(slots, 'g1', 4);

    const members = slots.filter((item) => item.supersetGroup === 'g1');
    expect(groupRounds(members)).toBe(4);
    expect(restSlotSeconds(members.find((m) => m.kind === 'rest') ?? createRestSlot('x', 0))).toBe(
      30,
    );
  });

  it('joins the circuit when inserted after a member', () => {
    const circuit = linkToPrevious(base(), 'b', 'g1');
    const slots = insertSlotAfter(circuit, 'a', createRestSlot('r1', 30));
    expect(slots.find((item) => item.slotId === 'r1')?.supersetGroup).toBe('g1');
  });

  it('is never given a round count by withGroupRounds', () => {
    let slots = linkToPrevious(base(), 'b', 'g1');
    slots = insertSlotAfter(slots, 'a', createRestSlot('r1', 30));
    slots = withGroupRounds(slots, 'g1', 5);

    const rest = slots.find((item) => item.slotId === 'r1');
    expect(rest?.prescription.sets).toBe(1);
    expect(restSlotSeconds(rest ?? createRestSlot('x', 0))).toBe(30);
  });

  it('survives a round trip through the parser', () => {
    const parsed = parseWorkoutBody({
      name: 'W',
      slots: [
        {
          slotId: 'r1',
          kind: 'rest',
          exerciseId: REST_SLOT_ID,
          prescription: { restSeconds: 45 },
        },
      ],
    });
    const rest = parsed.slots[0];
    expect(rest?.kind).toBe('rest');
    expect(rest?.exerciseName).toBe('Rest');
    expect(restSlotSeconds(rest ?? createRestSlot('x', 0))).toBe(45);
  });

  it('defaults an unmarked slot to an exercise', () => {
    const parsed = parseWorkoutBody({
      name: 'W',
      slots: [{ slotId: 's1', exerciseId: 'bench' }],
    });
    expect(parsed.slots[0]?.kind).toBe('exercise');
  });
});
