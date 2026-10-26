// @vitest-environment jsdom
// renderHook needs a DOM. The suite defaults to node; see vite.config.ts.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, resetSharedForTests, useSharedSubscription } from '@lift/data/hooks/useShared';

/**
 * The shared listener behind every data hook (`@lift/data/hooks/useShared`):
 * one Firestore listener per query, however many screens read it, and a
 * screen that mounts later reads the current value at once.
 */

type Emit = (value: string) => void;

function fakeQuery() {
  let emit: Emit = () => undefined;
  let fail: () => void = () => undefined;
  const stop = vi.fn();
  const start = vi.fn((next: Emit, onError: () => void) => {
    emit = next;
    fail = onError;
    return stop;
  });
  return {
    start,
    stop,
    emit: (value: string) => {
      act(() => {
        emit(value);
      });
    },
    fail: () => {
      act(() => {
        fail();
      });
    },
  };
}

afterEach(() => {
  resetSharedForTests();
  vi.useRealTimers();
});

describe('a shared subscription', () => {
  it('opens one listener for two readers', () => {
    const query = fakeQuery();
    renderHook(() => useSharedSubscription('workouts:u1', query.start));
    renderHook(() => useSharedSubscription('workouts:u1', query.start));
    expect(query.start).toHaveBeenCalledTimes(1);
  });

  it('hands a later reader the current value on its first render', () => {
    const query = fakeQuery();
    const first = renderHook(() => useSharedSubscription('workouts:u1', query.start));
    expect(first.result.current).toBeUndefined();
    query.emit('PUSH, PULL');
    expect(first.result.current).toBe('PUSH, PULL');

    // A screen opened afterwards: no pending render, the data is already there.
    const later = renderHook(() => useSharedSubscription('workouts:u1', query.start));
    expect(later.result.current).toBe('PUSH, PULL');
  });

  it('keeps the listener a while after its last reader, and stops it after that', () => {
    vi.useFakeTimers();
    const query = fakeQuery();
    const reader = renderHook(() => useSharedSubscription('workouts:u1', query.start));
    reader.unmount();

    // Back within the idle window: the same listener, not a new one.
    vi.advanceTimersByTime(IDLE_MS - 1);
    const back = renderHook(() => useSharedSubscription('workouts:u1', query.start));
    expect(query.start).toHaveBeenCalledTimes(1);
    back.unmount();

    vi.advanceTimersByTime(IDLE_MS);
    expect(query.stop).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh listener after one dies, as on sign-out and back in', () => {
    vi.useFakeTimers();
    const query = fakeQuery();
    const reader = renderHook(() => useSharedSubscription('workouts:u1', query.start));
    query.emit('PUSH');
    reader.unmount();

    // Signing out refuses the still-open listener; signing back in is quick.
    query.fail();
    expect(query.stop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(IDLE_MS - 1);
    const back = renderHook(() => useSharedSubscription('workouts:u1', query.start));
    expect(query.start).toHaveBeenCalledTimes(2);
    expect(back.result.current).toBe('PUSH');

    // The idle timer from before does not stop the new listener twice.
    back.unmount();
    vi.advanceTimersByTime(IDLE_MS);
    expect(query.stop).toHaveBeenCalledTimes(2);
  });

  it('keeps accounts apart: another key is another listener, and reads nothing yet', () => {
    const mine = fakeQuery();
    const theirs = fakeQuery();
    renderHook(() => useSharedSubscription('workouts:u1', mine.start));
    mine.emit('mine');
    const other = renderHook(() => useSharedSubscription('workouts:u2', theirs.start));
    expect(other.result.current).toBeUndefined();
    expect(theirs.start).toHaveBeenCalledTimes(1);
  });

  it('reads nothing for a null key', () => {
    const query = fakeQuery();
    const reader = renderHook(() => useSharedSubscription(null, query.start));
    expect(reader.result.current).toBeUndefined();
    expect(query.start).not.toHaveBeenCalled();
  });
});
