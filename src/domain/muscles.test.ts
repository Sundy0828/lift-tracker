import { describe, expect, it } from 'vitest';
import {
  MUSCLE_GROUPS,
  MUSCLE_REGIONS,
  isMuscleGroup,
  muscleLabel,
  parseMuscleGroups,
  regionOf,
} from './muscles';

describe('MUSCLE_GROUPS', () => {
  it('matches free-exercise-db vocabulary exactly', () => {
    // Guards §2.3: the app uses the source vocabulary verbatim so that no
    // mapping layer is needed. Changing this list breaks the bundled catalog.
    expect([...MUSCLE_GROUPS]).toEqual([
      'abdominals',
      'abductors',
      'adductors',
      'biceps',
      'calves',
      'chest',
      'forearms',
      'glutes',
      'hamstrings',
      'lats',
      'lower back',
      'middle back',
      'neck',
      'quadriceps',
      'shoulders',
      'traps',
      'triceps',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(MUSCLE_GROUPS).size).toBe(MUSCLE_GROUPS.length);
  });
});

describe('MUSCLE_REGIONS', () => {
  it('covers every muscle group exactly once', () => {
    const assigned = MUSCLE_REGIONS.flatMap((region) => region.muscles);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });

  it('resolves a region for every muscle', () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(regionOf(muscle)).not.toBeNull();
    }
  });
});

describe('muscleLabel', () => {
  it('gives every muscle a non-empty display label', () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(muscleLabel(muscle).length).toBeGreaterThan(0);
    }
  });

  it('shortens the long clinical names', () => {
    expect(muscleLabel('abdominals')).toBe('Abs');
    expect(muscleLabel('quadriceps')).toBe('Quads');
    expect(muscleLabel('middle back')).toBe('Mid back');
  });
});

describe('isMuscleGroup', () => {
  it('accepts known names and rejects everything else', () => {
    expect(isMuscleGroup('lats')).toBe(true);
    expect(isMuscleGroup('lower back')).toBe(true);
    for (const value of ['Lats', 'quads', 'pecs', '', null, 7, {}]) {
      expect(isMuscleGroup(value)).toBe(false);
    }
  });
});

describe('parseMuscleGroups', () => {
  it('keeps only recognised names', () => {
    expect(parseMuscleGroups(['chest', 'pecs', 'triceps'])).toEqual(['chest', 'triceps']);
  });

  it('deduplicates', () => {
    expect(parseMuscleGroups(['chest', 'chest'])).toEqual(['chest']);
  });

  it('returns empty for non-arrays', () => {
    for (const value of [null, undefined, 'chest', 42, {}]) {
      expect(parseMuscleGroups(value)).toEqual([]);
    }
  });
});
