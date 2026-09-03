import { describe, expect, it } from 'vitest';
import {
  BASE_MUSCLE_GROUPS,
  EXTENDED_MUSCLE_GROUPS,
  MUSCLE_EXTENSIONS,
  MUSCLE_GROUPS,
  MUSCLE_OPTIONS_BY_REGION,
  MUSCLE_REGIONS,
  baseMuscleOf,
  isBaseMuscleGroup,
  isExtendedMuscleGroup,
  isMuscleGroup,
  muscleLabel,
  parseBaseMuscleGroups,
  parseMuscleGroups,
  regionOf,
} from './muscles';

describe('BASE_MUSCLE_GROUPS', () => {
  it('matches free-exercise-db vocabulary exactly', () => {
    // Guards §2.3: the base tier is the source vocabulary verbatim, so
    // refreshing the vendored catalog never needs a translation step.
    // Changing this list breaks the bundled catalog.
    expect([...BASE_MUSCLE_GROUPS]).toEqual([
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
    expect(new Set(BASE_MUSCLE_GROUPS).size).toBe(BASE_MUSCLE_GROUPS.length);
  });
});

describe('muscle extensions', () => {
  it('parents every extension to a real base group', () => {
    for (const [muscle, parent] of Object.entries(MUSCLE_EXTENSIONS)) {
      expect(isBaseMuscleGroup(parent), `${muscle} -> ${parent}`).toBe(true);
    }
  });

  it('never reuses a base name as an extension', () => {
    for (const muscle of EXTENDED_MUSCLE_GROUPS) {
      expect(isBaseMuscleGroup(muscle)).toBe(false);
    }
  });

  it('combines both tiers into MUSCLE_GROUPS with no duplicates', () => {
    expect(MUSCLE_GROUPS).toHaveLength(BASE_MUSCLE_GROUPS.length + EXTENDED_MUSCLE_GROUPS.length);
    expect(new Set(MUSCLE_GROUPS).size).toBe(MUSCLE_GROUPS.length);
  });

  it('covers the gaps that motivated the second tier', () => {
    // Tibialis is the case that surfaced this: upstream tags it as `calves`,
    // its own antagonist, which would corrupt calf volume.
    expect(MUSCLE_EXTENSIONS.tibialis).toBe('calves');
    expect(MUSCLE_EXTENSIONS['rear delts']).toBe('shoulders');
    expect(MUSCLE_EXTENSIONS.obliques).toBe('abdominals');
  });
});

describe('baseMuscleOf', () => {
  it('resolves an extension to its parent', () => {
    expect(baseMuscleOf('tibialis')).toBe('calves');
    expect(baseMuscleOf('rear delts')).toBe('shoulders');
    expect(baseMuscleOf('upper chest')).toBe('chest');
  });

  it('resolves a base group to itself', () => {
    for (const muscle of BASE_MUSCLE_GROUPS) {
      expect(baseMuscleOf(muscle)).toBe(muscle);
    }
  });

  it('always lands on something the muscle map can paint', () => {
    // This is the guarantee that adding extensions costs the diagram nothing:
    // every muscle resolves to a base group, and every base group has a region.
    for (const muscle of MUSCLE_GROUPS) {
      const base = baseMuscleOf(muscle);
      expect(isBaseMuscleGroup(base)).toBe(true);
      expect(regionOf(base)).not.toBeNull();
    }
  });

  it('is idempotent, so rolling up twice cannot drift', () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(baseMuscleOf(baseMuscleOf(muscle))).toBe(baseMuscleOf(muscle));
    }
  });
});

describe('MUSCLE_REGIONS', () => {
  it('covers every base muscle group exactly once', () => {
    const assigned = MUSCLE_REGIONS.flatMap((region) => region.muscles);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual([...BASE_MUSCLE_GROUPS].sort());
  });

  it('resolves a region for every muscle in both tiers', () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(regionOf(muscle), muscle).not.toBeNull();
    }
  });

  it('puts an extension in its parent region', () => {
    expect(regionOf('rear delts')).toBe('Shoulders');
    expect(regionOf('tibialis')).toBe('Legs');
    expect(regionOf('obliques')).toBe('Core');
  });
});

describe('MUSCLE_OPTIONS_BY_REGION', () => {
  it('offers every muscle exactly once across all groups', () => {
    const values = MUSCLE_OPTIONS_BY_REGION.flatMap((group) =>
      group.items.map((item) => item.value),
    );
    expect(new Set(values).size).toBe(values.length);
    expect([...values].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });

  it('lists finer muscles under their parent region', () => {
    const shoulders = MUSCLE_OPTIONS_BY_REGION.find((group) => group.group === 'Shoulders');
    const values = shoulders?.items.map((item) => item.value) ?? [];
    expect(values).toContain('shoulders');
    expect(values).toContain('rear delts');
    expect(values).toContain('front delts');
  });
});

describe('muscleLabel', () => {
  it('gives every muscle in both tiers a non-empty display label', () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(muscleLabel(muscle).length, muscle).toBeGreaterThan(0);
    }
  });

  it('shortens the long clinical names', () => {
    expect(muscleLabel('abdominals')).toBe('Abs');
    expect(muscleLabel('quadriceps')).toBe('Quads');
    expect(muscleLabel('middle back')).toBe('Mid back');
  });

  it('labels extensions readably', () => {
    expect(muscleLabel('rear delts')).toBe('Rear delts');
    expect(muscleLabel('tibialis')).toBe('Tibialis');
  });
});

describe('type guards', () => {
  it('separates the tiers', () => {
    expect(isBaseMuscleGroup('lats')).toBe(true);
    expect(isBaseMuscleGroup('rear delts')).toBe(false);

    expect(isExtendedMuscleGroup('rear delts')).toBe(true);
    expect(isExtendedMuscleGroup('lats')).toBe(false);

    expect(isMuscleGroup('lats')).toBe(true);
    expect(isMuscleGroup('rear delts')).toBe(true);
  });

  it('rejects anything unknown', () => {
    for (const value of ['Lats', 'quads', 'pecs', '', null, 7, {}]) {
      expect(isMuscleGroup(value)).toBe(false);
    }
  });
});

describe('parseMuscleGroups', () => {
  it('keeps recognised names from both tiers', () => {
    expect(parseMuscleGroups(['chest', 'pecs', 'rear delts'])).toEqual(['chest', 'rear delts']);
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

describe('parseBaseMuscleGroups', () => {
  it('drops extensions, so upstream data can only use its own vocabulary', () => {
    expect(parseBaseMuscleGroups(['chest', 'rear delts', 'tibialis'])).toEqual(['chest']);
  });

  it('keeps base names', () => {
    expect(parseBaseMuscleGroups(['shoulders', 'calves'])).toEqual(['shoulders', 'calves']);
  });
});
