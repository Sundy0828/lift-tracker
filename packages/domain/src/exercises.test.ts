import { describe, expect, it } from 'vitest';
import type { CatalogExercise, CustomExercise, Exercise } from './exercises';
import {
  compareExercises,
  createExerciseResolver,
  equipmentLabel,
  fromCatalog,
  fromCustom,
  isEquipment,
  parseCatalogExercise,
  parseCustomExercise,
  parseExerciseDetails,
} from './exercises';

const bench: CatalogExercise = {
  id: 'Barbell_Bench_Press',
  name: 'Barbell Bench Press',
  force: 'push',
  level: 'beginner',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['shoulders', 'triceps'],
  category: 'strength',
};

const row: CatalogExercise = {
  ...bench,
  id: 'Bent_Over_Row',
  name: 'Bent Over Row',
  force: 'pull',
  primaryMuscles: ['middle back'],
  secondaryMuscles: ['biceps'],
};

const custom: CustomExercise = {
  id: 'custom_1',
  name: 'Cable Y-Raise',
  primaryMuscles: ['shoulders'],
  secondaryMuscles: ['traps'],
  equipment: 'cable',
  isCustom: true,
  createdAt: '2026-09-01T10:00:00.000Z',
};

describe('fromCatalog / fromCustom', () => {
  it('produces one shape from either source', () => {
    const a = fromCatalog(bench);
    const b = fromCustom(custom);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });

  it('marks provenance and nulls catalog-only fields on custom entries', () => {
    expect(fromCatalog(bench).isCustom).toBe(false);
    const converted = fromCustom(custom);
    expect(converted.isCustom).toBe(true);
    expect(converted.force).toBeNull();
    expect(converted.level).toBeNull();
    expect(converted.mechanic).toBeNull();
    expect(converted.category).toBeNull();
  });

  it('carries the catalog metadata through', () => {
    const converted = fromCatalog(bench);
    expect(converted.force).toBe('push');
    expect(converted.mechanic).toBe('compound');
    expect(converted.secondaryMuscles).toEqual(['shoulders', 'triceps']);
  });
});

describe('createExerciseResolver', () => {
  it('resolves catalog and custom exercises by id', () => {
    const resolver = createExerciseResolver([bench, row], [custom]);
    expect(resolver.resolve('Barbell_Bench_Press')?.name).toBe('Barbell Bench Press');
    expect(resolver.resolve('custom_1')?.name).toBe('Cable Y-Raise');
  });

  it('returns null for an unknown id rather than throwing', () => {
    const resolver = createExerciseResolver([bench], []);
    expect(resolver.resolve('nope')).toBeNull();
    expect(resolver.resolve('')).toBeNull();
  });

  it('lets a custom exercise shadow a catalog entry with the same id', () => {
    const shadow: CustomExercise = { ...custom, id: bench.id, name: 'My Bench' };
    const resolver = createExerciseResolver([bench], [shadow]);

    const resolved = resolver.resolve(bench.id);
    expect(resolved?.name).toBe('My Bench');
    expect(resolved?.isCustom).toBe(true);
    // The shadowed catalog entry must not also appear in the list.
    expect(resolver.all().filter((item) => item.id === bench.id)).toHaveLength(1);
  });

  it('sorts custom exercises first, then alphabetically', () => {
    const resolver = createExerciseResolver([row, bench], [custom]);
    expect(resolver.all().map((item) => item.name)).toEqual([
      'Cable Y-Raise',
      'Barbell Bench Press',
      'Bent Over Row',
    ]);
  });

  it('handles both sources being empty', () => {
    const resolver = createExerciseResolver([], []);
    expect(resolver.all()).toEqual([]);
    expect(resolver.resolve('anything')).toBeNull();
  });

  it('returns a stable list reference so downstream memos hold', () => {
    const resolver = createExerciseResolver([bench], []);
    expect(resolver.all()).toBe(resolver.all());
  });
});

describe('compareExercises', () => {
  const asExercise = (name: string, isCustom: boolean): Exercise => ({
    id: name,
    name,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    isCustom,
    force: null,
    level: null,
    mechanic: null,
    category: null,
  });

  it('is case-insensitive on name', () => {
    expect(compareExercises(asExercise('apple', false), asExercise('Banana', false))).toBeLessThan(
      0,
    );
  });

  it('puts custom ahead regardless of name', () => {
    expect(compareExercises(asExercise('zzz', true), asExercise('aaa', false))).toBeLessThan(0);
  });
});

describe('parseCatalogExercise', () => {
  const raw = {
    id: 'Bench',
    name: 'Bench',
    level: 'beginner',
    category: 'strength',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    force: 'push',
    mechanic: 'compound',
    equipment: 'barbell',
  };

  it('accepts a well-formed record', () => {
    expect(parseCatalogExercise(raw)).toEqual({
      id: 'Bench',
      name: 'Bench',
      force: 'push',
      level: 'beginner',
      mechanic: 'compound',
      equipment: 'barbell',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps'],
      category: 'strength',
    });
  });

  it('rejects records missing a required field', () => {
    expect(parseCatalogExercise({ ...raw, id: '' })).toBeNull();
    expect(parseCatalogExercise({ ...raw, name: undefined })).toBeNull();
    expect(parseCatalogExercise({ ...raw, level: 'godlike' })).toBeNull();
    expect(parseCatalogExercise({ ...raw, category: 'yoga' })).toBeNull();
    expect(parseCatalogExercise({ ...raw, primaryMuscles: [] })).toBeNull();
    expect(parseCatalogExercise({ ...raw, primaryMuscles: ['pecs'] })).toBeNull();
    expect(parseCatalogExercise({})).toBeNull();
  });

  it('nulls the optional fields rather than rejecting', () => {
    const parsed = parseCatalogExercise({
      ...raw,
      force: null,
      mechanic: null,
      equipment: null,
      secondaryMuscles: undefined,
    });
    expect(parsed?.force).toBeNull();
    expect(parsed?.mechanic).toBeNull();
    expect(parsed?.equipment).toBeNull();
    expect(parsed?.secondaryMuscles).toEqual([]);
  });

  it('drops unrecognised equipment instead of trusting it', () => {
    expect(parseCatalogExercise({ ...raw, equipment: 'sandbag' })?.equipment).toBeNull();
  });
});

describe('parseExerciseDetails', () => {
  it('keeps only string entries', () => {
    expect(
      parseExerciseDetails({ instructions: ['a', 2, null, 'b'], images: ['x/0.jpg'] }),
    ).toEqual({ instructions: ['a', 'b'], images: ['x/0.jpg'] });
  });

  it('defaults to empty arrays', () => {
    expect(parseExerciseDetails({})).toEqual({ instructions: [], images: [] });
  });
});

describe('parseCustomExercise', () => {
  it('narrows a Firestore record', () => {
    expect(
      parseCustomExercise('custom_9', {
        name: 'Pendlay Row',
        primaryMuscles: ['middle back', 'nonsense'],
        secondaryMuscles: ['biceps'],
        equipment: 'barbell',
        createdAt: '2026-09-01T10:00:00.000Z',
      }),
    ).toEqual({
      id: 'custom_9',
      name: 'Pendlay Row',
      primaryMuscles: ['middle back'],
      secondaryMuscles: ['biceps'],
      equipment: 'barbell',
      isCustom: true,
      createdAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('survives an empty or partial document', () => {
    const parsed = parseCustomExercise('custom_x', {});
    expect(parsed.name).toBe('');
    expect(parsed.primaryMuscles).toEqual([]);
    expect(parsed.equipment).toBeNull();
    expect(parsed.createdAt).toBeNull();
  });
});

describe('equipmentLabel / isEquipment', () => {
  it('labels a missing value honestly', () => {
    expect(equipmentLabel(null)).toBe('Unspecified');
    expect(equipmentLabel('cable')).toBe('cable');
  });

  it('validates equipment names', () => {
    expect(isEquipment('body only')).toBe(true);
    expect(isEquipment('Barbell')).toBe(false);
    expect(isEquipment(null)).toBe(false);
  });
});
