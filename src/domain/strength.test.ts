import { describe, expect, it } from 'vitest';
import type { LoggedSet } from './sessions';
import { emptySet } from './sessions';
import {
  adjustedE1rm,
  beatsRecord,
  bestSet,
  compareSets,
  describeDelta,
  e1rm,
  epley,
  formatE1rm,
  formatSet,
  loadKg,
} from './strength';
import type { Unit } from './types';

const KG_PER_LB = 0.45359237;

function set(
  weight: number | null,
  reps: number | null,
  rir: number | null,
  overrides: Partial<LoggedSet> & { unit?: Unit } = {},
): LoggedSet {
  const { unit = 'lb', ...rest } = overrides;
  return {
    ...emptySet(rest.setIndex ?? 0),
    weight: weight === null ? null : { value: weight, unit },
    reps,
    rir,
    ...rest,
  };
}

describe('epley', () => {
  it('returns the load itself for a single', () => {
    expect(epley(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 6);
  });

  it('scales with reps', () => {
    expect(epley(100, 10)).toBeCloseTo(133.333, 3);
  });
});

describe('e1rm', () => {
  it('normalises pounds to kilograms before estimating', () => {
    const estimate = e1rm(set(185, 8, 2));
    expect(estimate).toBeCloseTo(185 * KG_PER_LB * (1 + 8 / 30), 6);
  });

  it('ignores RIR', () => {
    expect(e1rm(set(100, 5, 0, { unit: 'kg' }))).toEqual(e1rm(set(100, 5, 4, { unit: 'kg' })));
  });

  it('is null without both a load and reps', () => {
    expect(e1rm(set(null, 8, 1))).toBeNull();
    expect(e1rm(set(185, null, 1))).toBeNull();
    expect(e1rm(set(185, 0, 1))).toBeNull();
  });
});

describe('adjustedE1rm', () => {
  it('adds reps in reserve to the reps performed', () => {
    expect(adjustedE1rm(set(100, 8, 2, { unit: 'kg' }))).toBeCloseTo(epley(100, 10), 6);
  });

  it('treats a missing RIR as taken to failure, which never inflates it', () => {
    expect(adjustedE1rm(set(100, 8, null, { unit: 'kg' }))).toBeCloseTo(epley(100, 8), 6);
  });

  /**
   * The point of the adjustment: a heavier easy set must not be beaten by a
   * lighter set simply because it was taken closer to failure.
   */
  it('does not score a harder set as an improvement over a heavier easy one', () => {
    const heavyEasy = adjustedE1rm(set(120, 5, 4, { unit: 'kg' }));
    const lightHard = adjustedE1rm(set(100, 8, 0, { unit: 'kg' }));
    expect(heavyEasy).not.toBeNull();
    expect(lightHard).not.toBeNull();
    expect(heavyEasy ?? 0).toBeGreaterThan(lightHard ?? 0);
  });
});

describe('loadKg', () => {
  it('converts as stored, so mixed-unit history compares', () => {
    expect(loadKg(set(100, 5, 1, { unit: 'kg' }))).toBe(100);
    expect(loadKg(set(220.462, 5, 1))).toBeCloseTo(100, 3);
  });
});

describe('compareSets', () => {
  it('is null when either side is incomplete', () => {
    expect(compareSets(set(185, null, 1), set(185, 8, 1))).toBeNull();
    expect(compareSets(set(185, 8, 1), set(null, 8, 1))).toBeNull();
  });

  it('reads more load at the same reps as up', () => {
    const comparison = compareSets(set(190, 8, 2), set(185, 8, 2));
    expect(comparison?.direction).toBe('up');
    expect(comparison?.weightDeltaKg).toBeCloseTo(5 * KG_PER_LB, 6);
    expect(comparison?.repsDelta).toBe(0);
  });

  it('resolves heavier-but-shorter on estimated 1RM, not raw weight', () => {
    // 195x5 @2 is 195x7 adjusted; 185x8 @2 is 185x10 adjusted, which is more.
    const comparison = compareSets(set(195, 5, 2), set(185, 8, 2));
    expect(comparison?.direction).toBe('down');
    expect(comparison?.weightDeltaKg).toBeGreaterThan(0);
  });

  it('reads the same numbers as unchanged', () => {
    expect(compareSets(set(185, 8, 2), set(185, 8, 2))?.direction).toBe('same');
  });

  /** Same output for more effort is a step back in capacity, not forward. */
  it('reads fewer reps in reserve at the same load as down', () => {
    const comparison = compareSets(set(185, 8, 0), set(185, 8, 3));
    expect(comparison?.direction).toBe('down');
    expect(comparison?.rirDelta).toBe(-3);
  });

  it('compares across units', () => {
    const comparison = compareSets(set(100, 5, 1, { unit: 'kg' }), set(220.462, 5, 1));
    expect(comparison?.direction).toBe('same');
  });
});

describe('describeDelta', () => {
  function delta(current: LoggedSet, previous: LoggedSet, unit: Unit = 'lb'): string {
    const comparison = compareSets(current, previous);
    expect(comparison).not.toBeNull();
    return describeDelta(
      comparison ?? {
        direction: 'same',
        e1rmDeltaKg: 0,
        weightDeltaKg: 0,
        repsDelta: 0,
        rirDelta: 0,
      },
      unit,
    );
  }

  it('reports the load when the load moved', () => {
    expect(delta(set(190, 8, 2), set(185, 8, 2))).toBe('+5 lb');
    expect(delta(set(180, 8, 2), set(185, 8, 2))).toBe('−5 lb');
  });

  it('reports reps when the load held', () => {
    expect(delta(set(185, 10, 2), set(185, 8, 2))).toBe('+2 reps');
    expect(delta(set(185, 9, 2), set(185, 8, 2))).toBe('+1 rep');
  });

  it('reports effort when load and reps both held', () => {
    // One fewer rep in reserve: harder, so the chip reads negative.
    expect(delta(set(185, 8, 1), set(185, 8, 2))).toBe('−1 RIR');
  });

  it('reads = for a set repeated exactly', () => {
    expect(delta(set(185, 8, 2), set(185, 8, 2))).toBe('=');
  });

  it('renders the load difference in the display unit', () => {
    // Last time in kg, this time in kg, shown to someone reading pounds.
    expect(delta(set(102.5, 5, 1, { unit: 'kg' }), set(100, 5, 1, { unit: 'kg' }), 'lb')).toBe(
      '+5.5 lb',
    );
  });
});

describe('bestSet', () => {
  it('picks the highest adjusted e1RM', () => {
    const sets = [set(185, 8, 3, { setIndex: 0 }), set(205, 5, 1, { setIndex: 1 })];
    expect(bestSet(sets)?.setIndex).toBe(0);
  });

  it('never lets a warmup take the record', () => {
    const sets = [set(315, 5, 0, { setIndex: 0, isWarmup: true }), set(185, 8, 2, { setIndex: 1 })];
    expect(bestSet(sets)?.setIndex).toBe(1);
  });

  it('ignores skipped and unfilled rows', () => {
    const sets = [
      set(400, 5, 0, { setIndex: 0, skipped: true }),
      set(null, null, null, { setIndex: 1 }),
      set(185, 8, 2, { setIndex: 2 }),
    ];
    expect(bestSet(sets)?.setIndex).toBe(2);
  });

  it('keeps the earlier of two equal sets', () => {
    const sets = [set(185, 8, 2, { setIndex: 0 }), set(185, 8, 2, { setIndex: 1 })];
    expect(bestSet(sets)?.setIndex).toBe(0);
  });

  it('is null when nothing was performed', () => {
    expect(bestSet([emptySet(0), emptySet(1)])).toBeNull();
  });
});

describe('beatsRecord', () => {
  it('requires strictly more, so repeating your best is not a PR', () => {
    expect(beatsRecord(100, 100)).toBe(false);
    expect(beatsRecord(100.000000001, 100)).toBe(false);
    expect(beatsRecord(100.5, 100)).toBe(true);
  });

  it('treats any performance as a record when there is none', () => {
    expect(beatsRecord(1, 0)).toBe(true);
  });
});

describe('formatting', () => {
  it('renders a set as weight x reps @ RIR', () => {
    expect(formatSet(set(185, 9, 2), 'lb')).toBe('185 lb × 9 @ 2 RIR');
  });

  it('omits what was not recorded', () => {
    expect(formatSet(set(185, 9, null), 'lb')).toBe('185 lb × 9');
    expect(formatSet(set(null, null, null), 'lb')).toBe('—');
  });

  it('converts a stored kilogram set for a pound reader', () => {
    expect(formatSet(set(100, 5, 1, { unit: 'kg' }), 'lb')).toBe('220.5 lb × 5 @ 1 RIR');
  });

  it('renders an e1RM in the display unit', () => {
    expect(formatE1rm(100, 'kg')).toBe('100 kg');
    expect(formatE1rm(100, 'lb')).toBe('220.5 lb');
  });
});
