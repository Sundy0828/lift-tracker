// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecentSearches } from './useRecentSearches';

const KEY = 'lift-tracker.recent-exercise-searches';

beforeEach(() => {
  localStorage.clear();
});

describe('useRecentSearches', () => {
  it('keeps the newest first', () => {
    const { result } = renderHook(() => useRecentSearches());

    act(() => {
      result.current.remember('bench');
    });
    act(() => {
      result.current.remember('squat');
    });

    expect(result.current.recent).toEqual(['squat', 'bench']);
  });

  it('moves a repeated search to the front rather than duplicating it', () => {
    const { result } = renderHook(() => useRecentSearches());

    act(() => {
      result.current.remember('bench');
    });
    act(() => {
      result.current.remember('squat');
    });
    act(() => {
      result.current.remember('BENCH');
    });

    expect(result.current.recent).toEqual(['BENCH', 'squat']);
  });

  it('ignores a blank query', () => {
    const { result } = renderHook(() => useRecentSearches());

    act(() => {
      result.current.remember('   ');
    });

    expect(result.current.recent).toEqual([]);
  });

  it('caps the list at six', () => {
    const { result } = renderHook(() => useRecentSearches());

    for (const query of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      act(() => {
        result.current.remember(query);
      });
    }

    expect(result.current.recent).toEqual(['g', 'f', 'e', 'd', 'c', 'b']);
  });

  it('survives a reload, and ignores junk in the key', () => {
    localStorage.setItem(KEY, JSON.stringify(['bench', 42, '', 'squat']));
    expect(renderHook(() => useRecentSearches()).result.current.recent).toEqual(['bench', 'squat']);

    localStorage.setItem(KEY, 'not json');
    expect(renderHook(() => useRecentSearches()).result.current.recent).toEqual([]);
  });

  it('clears', () => {
    const { result } = renderHook(() => useRecentSearches());

    act(() => {
      result.current.remember('bench');
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.recent).toEqual([]);
    expect(localStorage.getItem(KEY)).toBe('[]');
  });
});
