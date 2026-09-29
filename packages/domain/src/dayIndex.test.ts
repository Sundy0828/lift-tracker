import { describe, expect, it } from 'vitest';
import type { DaySummary } from './calendar';
import { byIndexYear, indexYearOf, parseDayIndex, toIndexRow } from './dayIndex';

function summary(over: Partial<DaySummary> = {}): DaySummary {
  return {
    sessionId: 's1',
    performedOn: '2026-08-26',
    seconds: 3600,
    sets: 18,
    volumeLoadKg: 4200.456,
    ...over,
  };
}

describe('indexYearOf', () => {
  it('files a session under its own year', () => {
    expect(indexYearOf('2026-08-26')).toBe('2026');
    expect(indexYearOf('2025-01-01')).toBe('2025');
  });

  it('refuses a key that is not a date', () => {
    expect(indexYearOf('nonsense')).toBeNull();
    expect(indexYearOf('')).toBeNull();
  });
});

describe('toIndexRow', () => {
  it('keeps the date in full and rounds the numbers', () => {
    expect(toIndexRow(summary())).toEqual({ d: '2026-08-26', s: 18, t: 3600, v: 4200.46 });
  });

  it('never writes a negative count', () => {
    expect(toIndexRow(summary({ sets: -3, seconds: -1 }))).toMatchObject({ s: 0, t: 0 });
  });
});

describe('parseDayIndex', () => {
  it('reads back what it wrote', () => {
    const written = { year: '2026', sessions: { s1: toIndexRow(summary()) } };
    expect(parseDayIndex(written)).toEqual([
      {
        sessionId: 's1',
        performedOn: '2026-08-26',
        seconds: 3600,
        sets: 18,
        volumeLoadKg: 4200.46,
      },
    ]);
  });

  it('reads a missing or empty document as nothing', () => {
    expect(parseDayIndex(undefined)).toEqual([]);
    expect(parseDayIndex({})).toEqual([]);
    expect(parseDayIndex({ sessions: 'nonsense' })).toEqual([]);
    expect(parseDayIndex({ sessions: [] })).toEqual([]);
  });

  it('drops a row with no usable date, rather than inventing a day', () => {
    const rows = parseDayIndex({
      sessions: {
        good: { d: '2026-08-26', s: 3, t: 60, v: 100 },
        undated: { s: 3, t: 60, v: 100 },
        bad: { d: 'nonsense', s: 3 },
        nothing: null,
      },
    });
    expect(rows.map((row) => row.sessionId)).toEqual(['good']);
  });

  it('fills in a number that is missing or not a number', () => {
    const [row] = parseDayIndex({ sessions: { s1: { d: '2026-08-26', s: 'lots' } } });
    expect(row).toEqual({
      sessionId: 's1',
      performedOn: '2026-08-26',
      seconds: 0,
      sets: 0,
      volumeLoadKg: 0,
    });
  });
});

describe('byIndexYear', () => {
  it('groups rows into the documents they belong in', () => {
    const years = byIndexYear([
      summary({ sessionId: 'a', performedOn: '2026-08-26' }),
      summary({ sessionId: 'b', performedOn: '2026-12-31' }),
      summary({ sessionId: 'c', performedOn: '2025-12-31' }),
    ]);

    expect([...years.keys()].sort()).toEqual(['2025', '2026']);
    expect([...(years.get('2026') ?? new Map()).keys()].sort()).toEqual(['a', 'b']);
  });

  it('keys by session, so the same session cannot be counted twice', () => {
    const years = byIndexYear([
      summary({ sessionId: 'a', sets: 10 }),
      summary({ sessionId: 'a', sets: 20 }),
    ]);
    const rows = years.get('2026');
    expect(rows?.size).toBe(1);
    expect(rows?.get('a')?.sets).toBe(20);
  });

  it('drops a row it cannot file', () => {
    expect(byIndexYear([summary({ performedOn: 'nonsense' })]).size).toBe(0);
  });
});
