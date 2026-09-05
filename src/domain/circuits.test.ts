import { describe, expect, it } from 'vitest';
import type { PlanExerciseSlot, PlanWorkout } from './plans';
import {
  DEFAULT_PRESCRIPTION,
  MAX_SETS,
  activeGroupIds,
  groupRounds,
  linkToPrevious,
  parseGroupRest,
  pruneGroupRest,
  supersetGroups,
  totalSets,
  unlink,
  withGroupRounds,
} from './plans';
import { workoutVolume, type MuscleLookup } from './volume';

/**
 * Circuits: a contiguous run of slots sharing a `supersetGroup`, run for a
 * number of rounds. The shape behind "20 push-ups, 20 crunches, 5 pull-ups,
 * three times through".
 */

function slot(overrides: Partial<PlanExerciseSlot> = {}): PlanExerciseSlot {
  return {
    slotId: 's',
    exerciseId: 'x',
    exerciseName: 'X',
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION },
    supersetGroup: null,
    notes: '',
    ...overrides,
  };
}

function asWorkout(slots: PlanExerciseSlot[]): PlanWorkout {
  return { workoutId: 'w', name: 'W', slots, groupRest: {} };
}

/** Warm-up, then the three-exercise circuit from the brief. */
function base(): PlanExerciseSlot[] {
  return [
    slot({ slotId: 'warm', exerciseId: 'warmup', exerciseName: 'Warm-up' }),
    slot({ slotId: 'a', exerciseId: 'pushup', exerciseName: 'Push-ups' }),
    slot({ slotId: 'b', exerciseId: 'crunch', exerciseName: 'Crunches' }),
    slot({ slotId: 'c', exerciseId: 'pullup', exerciseName: 'Pull-ups' }),
  ];
}

const find = (slots: readonly PlanExerciseSlot[], slotId: string): PlanExerciseSlot | undefined =>
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
  const threeMemberCircuit = (): PlanExerciseSlot[] =>
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
});

describe('groupRounds', () => {
  it('reports the shared set count', () => {
    const slots = linkToPrevious(base(), 'b', 'g1');
    const members = slots.filter((item) => item.supersetGroup === 'g1');
    expect(groupRounds(members)).toBe(DEFAULT_PRESCRIPTION.sets);
  });

  it('reports null when members disagree, as an imported plan can', () => {
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
