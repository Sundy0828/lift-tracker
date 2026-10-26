import { describe, expect, it } from 'vitest';
import type { LoggedSet } from './sessions';
import { emptySet } from './sessions';
import {
  BODYWEIGHT_REFERENCE_KG,
  adjustedE1rm,
  beatsRecord,
  bestSet,
  compareSets,
  describeComparison,
  describeE1rm,
  e1rm,
  epley,
  formatE1rm,
  formatSet,
  loadKg,
  loadScaleFor,
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
    const estimate = e1rm(set(185, 8, 2), 'external');
    expect(estimate).toBeCloseTo(185 * KG_PER_LB * (1 + 8 / 30), 6);
  });

  it('ignores RIR', () => {
    expect(e1rm(set(100, 5, 0, { unit: 'kg' }), 'external')).toEqual(
      e1rm(set(100, 5, 4, { unit: 'kg' }), 'external'),
    );
  });

  it('is null without both a load and reps', () => {
    expect(e1rm(set(null, 8, 1), 'external')).toBeNull();
    expect(e1rm(set(185, null, 1), 'external')).toBeNull();
    expect(e1rm(set(185, 0, 1), 'external')).toBeNull();
  });
});

describe('adjustedE1rm', () => {
  it('adds reps in reserve to the reps performed', () => {
    expect(adjustedE1rm(set(100, 8, 2, { unit: 'kg' }), 'external')).toBeCloseTo(epley(100, 10), 6);
  });

  it('treats a missing RIR as taken to failure, which never inflates it', () => {
    expect(adjustedE1rm(set(100, 8, null, { unit: 'kg' }), 'external')).toBeCloseTo(
      epley(100, 8),
      6,
    );
  });

  /**
   * The point of the adjustment: a heavier easy set must not be beaten by a
   * lighter set simply because it was taken closer to failure.
   */
  it('does not score a harder set as an improvement over a heavier easy one', () => {
    const heavyEasy = adjustedE1rm(set(120, 5, 4, { unit: 'kg' }), 'external');
    const lightHard = adjustedE1rm(set(100, 8, 0, { unit: 'kg' }), 'external');
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
    expect(compareSets(set(185, null, 1), set(185, 8, 1), 'external')).toBeNull();
    expect(compareSets(set(185, 8, 1), set(null, 8, 1), 'external')).toBeNull();
  });

  it('reads more load at the same reps as up', () => {
    const comparison = compareSets(set(190, 8, 2), set(185, 8, 2), 'external');
    expect(comparison?.direction).toBe('up');
    expect(comparison?.weightDeltaKg).toBeCloseTo(5 * KG_PER_LB, 6);
    expect(comparison?.repsDelta).toBe(0);
  });

  it('resolves heavier-but-shorter on estimated 1RM, not raw weight', () => {
    // 195x5 @2 is 195x7 adjusted; 185x8 @2 is 185x10 adjusted, which is more.
    const comparison = compareSets(set(195, 5, 2), set(185, 8, 2), 'external');
    expect(comparison?.direction).toBe('down');
    expect(comparison?.weightDeltaKg).toBeGreaterThan(0);
  });

  it('reads the same numbers as unchanged', () => {
    expect(compareSets(set(185, 8, 2), set(185, 8, 2), 'external')?.direction).toBe('same');
  });

  /** Same output for more effort is a step back in capacity, not forward. */
  it('reads fewer reps in reserve at the same load as down', () => {
    const comparison = compareSets(set(185, 8, 0), set(185, 8, 3), 'external');
    expect(comparison?.direction).toBe('down');
    expect(comparison?.rirDelta).toBe(-3);
  });

  it('compares across units', () => {
    const comparison = compareSets(set(100, 5, 1, { unit: 'kg' }), set(220.462, 5, 1), 'external');
    expect(comparison?.direction).toBe('same');
  });
});

describe('describeComparison', () => {
  function chip(current: LoggedSet, previous: LoggedSet, unit: Unit = 'lb') {
    const result = describeComparison(current, previous, unit, 'external');
    expect(result).not.toBeNull();
    return result ?? { label: '', direction: 'same' as const, detail: '' };
  }

  it('is null when either side is incomplete', () => {
    expect(describeComparison(set(185, null, 1), set(185, 8, 1), 'lb', 'external')).toBeNull();
  });

  it('names the load alone when only the load moved', () => {
    expect(chip(set(190, 8, 2), set(185, 8, 2)).label).toBe('+5 lb');
    expect(chip(set(180, 8, 2), set(185, 8, 2)).label).toBe('−5 lb');
  });

  it('names the reps alone when only the reps moved', () => {
    expect(chip(set(185, 10, 2), set(185, 8, 2)).label).toBe('+2 reps');
    expect(chip(set(185, 9, 2), set(185, 8, 2)).label).toBe('+1 rep');
  });

  it('names the effort alone when only the effort moved', () => {
    expect(chip(set(185, 8, 1), set(185, 8, 2)).label).toBe('−1 RIR');
  });

  it('reads = for a set repeated exactly', () => {
    const result = chip(set(185, 8, 2), set(185, 8, 2));
    expect(result.label).toBe('=');
    expect(result.direction).toBe('same');
  });

  /**
   * The case this function was rewritten for. Reporting only the load made
   * this read as a red "+5 lb": the label said the weight went up, the colour
   * said the set was worse, and the three reps that explained the
   * contradiction were not shown at all.
   */
  it('names both axes when load and reps both moved', () => {
    const result = chip(set(50, 12, null), set(45, 15, null));
    expect(result.label).toBe('+5 lb · −3 reps');
    expect(result.detail).toContain('50 lb × 12');
    expect(result.detail).toContain('45 lb × 15');
  });

  it('agrees with its own colour when the trade-off is a net loss', () => {
    // 50x10 estimates below 45x15, so the chip says both halves of the
    // trade-off and the colour adjudicates it.
    const result = chip(set(50, 10, null), set(45, 15, null));
    expect(result.direction).toBe('down');
    expect(result.label).toBe('+5 lb · −5 reps');
    expect(result.detail).toContain('estimated 1RM down');
  });

  it('states the verdict in the detail, which is what the colour means', () => {
    expect(chip(set(190, 8, 2), set(185, 8, 2)).detail).toContain('estimated 1RM up');
    expect(chip(set(185, 8, 2), set(185, 8, 2)).detail).toContain('estimated 1RM unchanged');
  });

  it('shows at most two axes, leaving the third to the detail', () => {
    const result = chip(set(190, 10, 1), set(185, 8, 2));
    expect(result.label).toBe('+5 lb · +2 reps');
    expect(result.detail).toContain('@ 1 RIR');
  });

  it('renders the load difference in the display unit', () => {
    // Last time in kg, this time in kg, shown to someone reading pounds.
    expect(chip(set(102.5, 5, 1, { unit: 'kg' }), set(100, 5, 1, { unit: 'kg' }), 'lb').label).toBe(
      '+5.5 lb',
    );
  });
});

describe('bestSet', () => {
  it('picks the highest adjusted e1RM', () => {
    const sets = [set(185, 8, 3, { setIndex: 0 }), set(205, 5, 1, { setIndex: 1 })];
    expect(bestSet(sets, 'external')?.setIndex).toBe(0);
  });

  it('never lets a warmup take the record', () => {
    const sets = [set(315, 5, 0, { setIndex: 0, isWarmup: true }), set(185, 8, 2, { setIndex: 1 })];
    expect(bestSet(sets, 'external')?.setIndex).toBe(1);
  });

  it('ignores skipped and unfilled rows', () => {
    const sets = [
      set(400, 5, 0, { setIndex: 0, skipped: true }),
      set(null, null, null, { setIndex: 1 }),
      set(185, 8, 2, { setIndex: 2 }),
    ];
    expect(bestSet(sets, 'external')?.setIndex).toBe(2);
  });

  it('keeps the earlier of two equal sets', () => {
    const sets = [set(185, 8, 2, { setIndex: 0 }), set(185, 8, 2, { setIndex: 1 })];
    expect(bestSet(sets, 'external')?.setIndex).toBe(0);
  });

  it('is null when nothing was performed', () => {
    expect(bestSet([emptySet(0), emptySet(1)], 'external')).toBeNull();
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

describe('describeE1rm', () => {
  it('says the number is an estimated single, not a weight anybody lifted', () => {
    // The case that prompted it: a record of 61.3 lb from a set of 40 × 15.
    const text = describeE1rm(
      { weight: { value: 40, unit: 'lb' }, reps: 15, rir: 1 },
      'lb',
      'external',
    );

    expect(text).toContain('40 lb × 15 @ 1 RIR');
    expect(text).toContain('estimates a single of 61.3 lb');
  });

  it('explains that reps in reserve are counted as reps', () => {
    const text = describeE1rm(
      { weight: { value: 40, unit: 'lb' }, reps: 15, rir: 1 },
      'lb',
      'external',
    );
    expect(text).toContain('scores as 16');
  });

  it('says nothing about reserve when there was none', () => {
    const text = describeE1rm(
      { weight: { value: 225, unit: 'lb' }, reps: 3, rir: 0 },
      'lb',
      'external',
    );
    expect(text).not.toContain('reserve');
  });

  it('warns that a long set reads high', () => {
    const long = describeE1rm(
      { weight: { value: 40, unit: 'lb' }, reps: 15, rir: 1 },
      'lb',
      'external',
    );
    const short = describeE1rm(
      { weight: { value: 225, unit: 'lb' }, reps: 5, rir: 1 },
      'lb',
      'external',
    );

    expect(long).toContain('reads high');
    expect(short).not.toContain('reads high');
  });

  it('has nothing to say about a set that cannot be scored', () => {
    expect(describeE1rm({ weight: null, reps: 8, rir: 1 }, 'lb', 'external')).toBeNull();
    expect(
      describeE1rm({ weight: { value: 40, unit: 'lb' }, reps: null, rir: 1 }, 'lb', 'external'),
    ).toBeNull();
  });
});

describe('load scale', () => {
  const kg = (weight: number, reps: number, overrides: Partial<LoggedSet> = {}) =>
    set(weight, reps, null, { unit: 'kg', ...overrides });

  it('reads the scale from the equipment', () => {
    expect(loadScaleFor({ id: 'Pullups', equipment: 'body only' })).toBe('bodyweight');
    expect(loadScaleFor({ id: 'Barbell_Squat', equipment: 'barbell' })).toBe('external');
    expect(loadScaleFor({ id: 'custom-1', equipment: null })).toBe('external');
    // Unresolved: scored as it always was, never guessed to be bodyweight.
    expect(loadScaleFor(null)).toBe('external');
  });

  it('puts the catalog bodyweight lifts filed under other equipment on the bodyweight scale', () => {
    expect(loadScaleFor({ id: 'Dips_-_Chest_Version', equipment: 'other' })).toBe('bodyweight');
    expect(loadScaleFor({ id: 'Ring_Dips', equipment: 'other' })).toBe('bodyweight');
    expect(loadScaleFor({ id: 'Dip_Machine', equipment: 'machine' })).toBe('external');
  });

  /**
   * The bug this scale exists for: scored by the sign of the load, 0 × 10
   * dips beat +20 × 8, so adding weight read as getting weaker.
   */
  it('scores a bodyweight exercise against bodyweight at every load', () => {
    expect(adjustedE1rm(kg(20, 8), 'bodyweight')).toBeCloseTo(
      epley(BODYWEIGHT_REFERENCE_KG + 20, 8) - BODYWEIGHT_REFERENCE_KG,
      6,
    );
    expect(adjustedE1rm(kg(20, 8), 'bodyweight')).toBeCloseTo(46.667, 3);
    expect(adjustedE1rm(kg(0, 10), 'bodyweight')).toBeCloseTo(26.667, 3);
    expect(adjustedE1rm(kg(-20, 10), 'bodyweight')).toBeCloseTo(0, 6);
  });

  it('is continuous through zero for a bodyweight exercise', () => {
    const unweighted = adjustedE1rm(kg(0, 10), 'bodyweight') ?? NaN;
    const belted = adjustedE1rm(kg(2.5, 10), 'bodyweight') ?? NaN;
    const assisted = adjustedE1rm(kg(-2.5, 10), 'bodyweight') ?? NaN;

    expect(belted).toBeGreaterThan(unweighted);
    expect(assisted).toBeLessThan(unweighted);
    // A plate's worth either side, not a cliff.
    expect(belted - unweighted).toBeLessThan(5);
    expect(beatsRecord(belted, unweighted)).toBe(true);
  });

  it('lets weighted dips beat bodyweight dips', () => {
    expect(compareSets(kg(20, 8), kg(0, 10), 'bodyweight')?.direction).toBe('up');
    const best = bestSet(
      [kg(0, 10, { setIndex: 0 }), kg(20, 8, { setIndex: 1 }), kg(10, 6, { setIndex: 2 })],
      'bodyweight',
    );
    expect(best?.setIndex).toBe(1);
  });

  it('leaves a barbell set on plain Epley', () => {
    expect(adjustedE1rm(kg(100, 5), 'external')).toBeCloseTo(epley(100, 5), 6);
    expect(e1rm(kg(100, 5), 'external')).toBeCloseTo(epley(100, 5), 6);
    // The same set on the bodyweight scale would read very differently, which
    // is why the scale is the exercise's and never mixed within one.
    expect(adjustedE1rm(kg(100, 5), 'bodyweight')).not.toBeCloseTo(epley(100, 5), 0);
  });

  it('still scores an assisted set on an unclassified exercise against bodyweight', () => {
    // A custom "Assisted Pull-up" with no equipment recorded.
    expect(adjustedE1rm(kg(-20, 10), 'external')).toBeCloseTo(0, 6);
    expect(adjustedE1rm(kg(0, 10), 'external')).toBeCloseTo(
      adjustedE1rm(kg(0, 10), 'bodyweight') ?? NaN,
      6,
    );
    expect(compareSets(kg(-10, 8), kg(-30, 8), 'external')?.direction).toBe('up');
  });

  it('explains a weighted bodyweight set as weight added to the body', () => {
    const text = describeE1rm(kg(20, 8), 'kg', 'bodyweight');
    expect(text).toContain('a single with 46.7 kg added');
    expect(text).toContain('more added weight');
    expect(describeE1rm(kg(100, 5), 'kg', 'external')).toContain('estimates a single of');
  });
});
