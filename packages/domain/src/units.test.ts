import { describe, expect, it } from 'vitest';
import type { Weight } from './types';
import {
  convert,
  convertForInput,
  formatNumber,
  formatWeight,
  fromKg,
  isUnit,
  needsUnitAnnotation,
  roundToStep,
  stepFor,
  toKg,
} from './units';

const lb = (value: number): Weight => ({ value, unit: 'lb' });
const kg = (value: number): Weight => ({ value, unit: 'kg' });

describe('isUnit', () => {
  it('accepts the two supported units', () => {
    expect(isUnit('lb')).toBe(true);
    expect(isUnit('kg')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['LB', 'lbs', 'stone', '', 0, null, undefined, {}]) {
      expect(isUnit(value)).toBe(false);
    }
  });
});

describe('toKg / fromKg', () => {
  it('leaves kg untouched', () => {
    expect(toKg(kg(100))).toBe(100);
    expect(fromKg(100, 'kg')).toBe(100);
  });

  it('uses the exact avoirdupois pound', () => {
    expect(toKg(lb(1))).toBeCloseTo(0.45359237, 10);
    expect(toKg(lb(225))).toBeCloseTo(102.0582832, 6);
  });

  it('treats zero and negatives as plain arithmetic', () => {
    expect(toKg(lb(0))).toBe(0);
    expect(toKg(lb(-10))).toBeCloseTo(-4.5359237, 6);
  });
});

describe('convert', () => {
  it('returns the identical object when the unit already matches', () => {
    const weight = lb(185);
    expect(convert(weight, 'lb')).toBe(weight);
  });

  it('converts across units', () => {
    expect(convert(lb(220.462262), 'kg').value).toBeCloseTo(100, 6);
    expect(convert(kg(100), 'lb').value).toBeCloseTo(220.462262, 5);
  });

  it('round-trips without drift', () => {
    for (const value of [0, 2.5, 45, 135, 185, 225, 315, 405.5]) {
      expect(convert(convert(lb(value), 'kg'), 'lb').value).toBeCloseTo(value, 9);
      expect(convert(convert(kg(value), 'lb'), 'kg').value).toBeCloseTo(value, 9);
    }
  });
});

describe('stepFor / roundToStep', () => {
  it('uses each unit natural plate increment', () => {
    expect(stepFor('lb')).toBe(2.5);
    expect(stepFor('kg')).toBe(1.25);
  });

  it('snaps to the nearest increment', () => {
    expect(roundToStep(183.7, 'lb')).toBe(182.5);
    expect(roundToStep(184, 'lb')).toBe(185);
    expect(roundToStep(183, 'lb')).toBe(182.5);
    expect(roundToStep(100.4, 'kg')).toBe(100);
    expect(roundToStep(101, 'kg')).toBe(101.25);
  });

  it('rounds half increments up and keeps zero at zero', () => {
    expect(roundToStep(1.25, 'lb')).toBe(2.5);
    expect(roundToStep(0, 'lb')).toBe(0);
    expect(roundToStep(0, 'kg')).toBe(0);
  });

  it('leaves already-aligned values exactly alone', () => {
    for (const value of [2.5, 45, 137.5, 225]) {
      expect(roundToStep(value, 'lb')).toBe(value);
    }
  });
});

describe('convertForInput', () => {
  it('snaps the converted value to the target increment', () => {
    // 185 lb is 83.9146 kg, which snaps to the nearest 1.25 kg.
    expect(convertForInput(lb(185), 'kg')).toEqual({ value: 83.75, unit: 'kg' });
    // 100 kg is 220.462 lb, which snaps to the nearest 2.5 lb.
    expect(convertForInput(kg(100), 'lb')).toEqual({ value: 220, unit: 'lb' });
  });

  it('is a no-op when units match, so no rounding is introduced', () => {
    const odd = lb(183.3);
    expect(convertForInput(odd, 'lb')).toBe(odd);
  });
});

describe('formatNumber', () => {
  it('drops the decimal for whole numbers', () => {
    expect(formatNumber(185)).toBe('185');
    expect(formatNumber(185.04)).toBe('185');
  });

  it('keeps one decimal by default', () => {
    expect(formatNumber(83.914)).toBe('83.9');
  });

  it('honours a wider precision', () => {
    expect(formatNumber(83.914, 2)).toBe('83.91');
  });
});

describe('formatWeight', () => {
  it('renders in the display unit with a suffix', () => {
    expect(formatWeight(lb(185), 'lb')).toBe('185 lb');
    expect(formatWeight(kg(100), 'kg')).toBe('100 kg');
  });

  it('converts history stored in the other unit', () => {
    expect(formatWeight(lb(185), 'kg')).toBe('83.9 kg');
    expect(formatWeight(kg(100), 'lb')).toBe('220.5 lb');
  });

  it('can omit the unit for compact rows', () => {
    expect(formatWeight(lb(185), 'lb', { withUnit: false })).toBe('185');
  });
});

describe('needsUnitAnnotation', () => {
  it('flags only rows whose stored unit differs from the preference', () => {
    expect(needsUnitAnnotation(lb(185), 'lb')).toBe(false);
    expect(needsUnitAnnotation(lb(185), 'kg')).toBe(true);
  });
});
