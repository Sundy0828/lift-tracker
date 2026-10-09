import { describe, expect, it } from 'vitest';
import { MAX_RECENT_SEARCHES, parseRecentSearches, rememberSearch } from './recentSearches';

describe('rememberSearch', () => {
  it('puts the newest first', () => {
    expect(rememberSearch(['bench'], 'squat')).toEqual(['squat', 'bench']);
  });

  it('moves a repeat to the front instead of keeping two', () => {
    expect(rememberSearch(['squat', 'bench'], 'BENCH')).toEqual(['BENCH', 'squat']);
  });

  it('trims, and ignores a blank query', () => {
    const recent = ['bench'];
    expect(rememberSearch(recent, '  row ')).toEqual(['row', 'bench']);
    expect(rememberSearch(recent, '   ')).toBe(recent);
  });

  it(`keeps at most ${String(MAX_RECENT_SEARCHES)}`, () => {
    let recent: readonly string[] = [];
    for (let index = 0; index < 10; index += 1)
      recent = rememberSearch(recent, `q${String(index)}`);
    expect(recent).toHaveLength(MAX_RECENT_SEARCHES);
    expect(recent[0]).toBe('q9');
  });
});

describe('parseRecentSearches', () => {
  it('reads a stored list', () => {
    expect(parseRecentSearches('["squat","bench"]')).toEqual(['squat', 'bench']);
  });

  it('reads nothing from a missing, malformed or foreign value', () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches('{not json')).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
  });

  it('drops entries that are not usable strings', () => {
    expect(parseRecentSearches('["bench", 3, "", "  ", null, "row"]')).toEqual(['bench', 'row']);
  });

  it('caps an oversized list', () => {
    const many = JSON.stringify(Array.from({ length: 20 }, (_, index) => `q${String(index)}`));
    expect(parseRecentSearches(many)).toHaveLength(MAX_RECENT_SEARCHES);
  });
});
