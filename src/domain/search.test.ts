import { describe, expect, it } from 'vitest';
import type { Exercise } from './exercises';
import type { MuscleGroup } from './muscles';
import { buildSearchIndex, scoreName, search, tokenize } from './search';

type Overrides = Partial<Omit<Exercise, 'id' | 'name'>>;

function make(name: string, overrides: Overrides = {}): Exercise {
  return {
    id: name.replace(/\s+/gu, '_'),
    name,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    isCustom: false,
    force: null,
    level: null,
    mechanic: null,
    category: null,
    ...overrides,
  };
}

const CATALOG: readonly Exercise[] = [
  make('Barbell Bench Press', { primaryMuscles: ['chest'], equipment: 'barbell' }),
  make('Incline Dumbbell Bench Press', {
    primaryMuscles: ['chest'],
    secondaryMuscles: ['shoulders'],
    equipment: 'dumbbell',
  }),
  make('Bench Dip', { primaryMuscles: ['triceps'], equipment: 'body only' }),
  make('Barbell Squat', { primaryMuscles: ['quadriceps'], equipment: 'barbell' }),
  make('Cable Fly', { primaryMuscles: ['chest'], equipment: 'cable' }),
  make('Pull-up', { primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], equipment: null }),
  make('My Bench Variation', { primaryMuscles: ['chest'], isCustom: true, equipment: 'barbell' }),
];

const index = buildSearchIndex(CATALOG);
const names = (results: readonly Exercise[]): string[] => results.map((item) => item.name);

describe('tokenize', () => {
  it('lowercases and splits on punctuation', () => {
    expect(tokenize('Incline Dumbbell Bench Press')).toEqual([
      'incline',
      'dumbbell',
      'bench',
      'press',
    ]);
    expect(tokenize('Pull-up')).toEqual(['pull', 'up']);
    expect(tokenize('3/4 Sit-Up')).toEqual(['3', '4', 'sit', 'up']);
  });

  it('drops empty tokens', () => {
    expect(tokenize('  --  ')).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });
});

describe('buildSearchIndex', () => {
  it('indexes every prefix of every token', () => {
    const single = buildSearchIndex([make('Squat')]);
    for (const prefix of ['s', 'sq', 'squ', 'squa', 'squat']) {
      expect(single.byPrefix.get(prefix)).toEqual([0]);
    }
    expect(single.byPrefix.get('squats')).toBeUndefined();
  });

  it('maps a shared prefix to every matching entry, without duplicates', () => {
    const bucket = index.byPrefix.get('bench');
    expect(bucket).toBeDefined();
    // Four names contain a "bench" token; each appears once.
    expect(bucket).toHaveLength(4);
    expect(new Set(bucket).size).toBe(4);
  });

  it('keeps the entry list it was given', () => {
    expect(index.entries).toBe(CATALOG);
  });

  it('handles an empty catalog', () => {
    const empty = buildSearchIndex([]);
    expect(empty.byPrefix.size).toBe(0);
    expect(search(empty, 'bench')).toEqual([]);
  });
});

describe('search', () => {
  it('returns everything for an empty query, custom first', () => {
    const results = search(index, '');
    expect(results).toHaveLength(CATALOG.length);
    expect(results[0]?.name).toBe('My Bench Variation');
  });

  it('matches on a prefix as you type', () => {
    for (const query of ['b', 'be', 'ben', 'benc', 'bench']) {
      expect(names(search(index, query))).toContain('Barbell Bench Press');
    }
  });

  it('ranks an exact name match first', () => {
    expect(names(search(index, 'Bench Dip'))[0]).toBe('Bench Dip');
    expect(names(search(index, 'cable fly'))[0]).toBe('Cable Fly');
  });

  it('ranks a leading-word match above a later-word match', () => {
    const results = names(search(index, 'bench'));
    expect(results.indexOf('Bench Dip')).toBeLessThan(results.indexOf('Barbell Bench Press'));
  });

  it('requires every query token to match (AND, not OR)', () => {
    expect(names(search(index, 'incline bench'))).toEqual(['Incline Dumbbell Bench Press']);
    expect(search(index, 'incline squat')).toEqual([]);
  });

  it('is order-insensitive across query tokens', () => {
    expect(names(search(index, 'bench incline'))).toEqual(['Incline Dumbbell Bench Press']);
  });

  it('ignores case and punctuation in the query', () => {
    expect(names(search(index, 'PULL-UP'))).toEqual(['Pull-up']);
    expect(names(search(index, 'pull up'))).toEqual(['Pull-up']);
  });

  it('returns nothing for a query that matches no token', () => {
    expect(search(index, 'zercher')).toEqual([]);
    expect(search(index, 'xyzzy')).toEqual([]);
  });

  it('finds a custom exercise alongside catalog results', () => {
    const results = search(index, 'bench');
    const custom = results.find((item) => item.isCustom);
    expect(custom?.name).toBe('My Bench Variation');
  });

  it('breaks score ties in favour of the custom exercise', () => {
    const twins = buildSearchIndex([
      make('Zulu Press', { isCustom: false }),
      make('Zulu Press', { isCustom: true }),
    ]);
    expect(search(twins, 'zulu press')[0]?.isCustom).toBe(true);
  });

  describe('filters', () => {
    it('filters by muscle across primary and secondary', () => {
      expect(names(search(index, '', { muscles: ['quadriceps'] }))).toEqual(['Barbell Squat']);
      // Pull-up has biceps only as a secondary muscle.
      expect(names(search(index, '', { muscles: ['biceps'] }))).toEqual(['Pull-up']);
    });

    it('treats multiple muscles as OR', () => {
      const results = search(index, '', { muscles: ['quadriceps', 'lats'] });
      expect(names(results).sort()).toEqual(['Barbell Squat', 'Pull-up']);
    });

    it('filters by equipment', () => {
      const results = search(index, '', { equipment: ['barbell'] });
      expect(names(results).sort()).toEqual([
        'Barbell Bench Press',
        'Barbell Squat',
        'My Bench Variation',
      ]);
    });

    it('can filter to entries with no equipment recorded', () => {
      expect(names(search(index, '', { equipment: [null] }))).toEqual(['Pull-up']);
    });

    it('combines a query with filters', () => {
      expect(names(search(index, 'bench', { equipment: ['body only'] }))).toEqual(['Bench Dip']);
      expect(search(index, 'bench', { muscles: ['quadriceps'] })).toEqual([]);
    });

    it('can restrict to custom exercises', () => {
      expect(names(search(index, '', { customOnly: true }))).toEqual(['My Bench Variation']);
    });

    it('treats empty filter arrays as no filter', () => {
      expect(search(index, '', { muscles: [], equipment: [] })).toHaveLength(CATALOG.length);
    });
  });

  it('honours a result limit', () => {
    expect(search(index, '', { limit: 2 })).toHaveLength(2);
    expect(search(index, '', { limit: 0 })).toHaveLength(0);
  });
});

describe('scoreName', () => {
  it('scores everything as a match for an empty query', () => {
    expect(scoreName('Anything', [])).toBeGreaterThan(0);
  });

  it('scores no match as zero', () => {
    expect(scoreName('Barbell Squat', ['bench'])).toBe(0);
  });

  it('scores an exact name above a prefix of it', () => {
    expect(scoreName('Bench', ['bench'])).toBeGreaterThan(scoreName('Bench Dip', ['bench']));
  });

  it('scores a whole-word hit above a partial one', () => {
    expect(scoreName('Row', ['row'])).toBeGreaterThan(scoreName('Rowing', ['row']));
  });
});

describe('performance over the real catalog size', () => {
  // 900 entries is the live catalog (876) plus room for custom exercises.
  const many = Array.from({ length: 900 }, (_, position) => {
    const muscles: MuscleGroup[] = position % 2 === 0 ? ['chest'] : ['lats'];
    return make(`Exercise Variation Number ${String(position)} Press`, {
      primaryMuscles: muscles,
    });
  });

  it('builds the index quickly enough to do it on every custom-exercise change', () => {
    const started = performance.now();
    buildSearchIndex(many);
    // Generous bound for CI; locally this is ~2 ms.
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('searches without scanning the whole catalog', () => {
    const big = buildSearchIndex(many);
    const started = performance.now();
    for (let run = 0; run < 50; run += 1) search(big, 'press', { limit: 50 });
    // Wall clock measured while the rest of the suite runs on other workers,
    // so the bound has to survive a loaded machine: uncontended this is tens
    // of milliseconds, and a bound that merely fits *that* fails whenever
    // another test file happens to be scheduled alongside it. What this
    // guards against is an algorithmic regression — dropping the index and
    // scanning — which costs orders of magnitude, not a factor of two.
    expect(performance.now() - started).toBeLessThan(4000);
  });

  it('still returns correct results at that size', () => {
    const big = buildSearchIndex(many);
    const results = search(big, 'number 42 press').map((item) => item.name);

    // Prefix matching is the point, so "42" also reaches 420-429. What matters
    // is that the whole-word hit is ranked first and nothing unrelated appears.
    expect(results[0]).toBe('Exercise Variation Number 42 Press');
    expect(results).toHaveLength(11);
    expect(results.every((name) => /Number 42\d? Press$/u.test(name))).toBe(true);
  });
});
