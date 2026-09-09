// @vitest-environment jsdom
// The suite defaults to node; see vite.config.ts.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

/**
 * The two things about this hook that are easy to get wrong and invisible when
 * they are: that a lock the platform drops on hide is *retaken* on return, and
 * that a refusal is silent rather than an error.
 *
 * jsdom has no Screen Wake Lock API, so it is stood up here. That is the point
 * — every branch this exercises is a platform behaviour that cannot be
 * reproduced by clicking around in a browser that always says yes.
 */

type Sentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
  fireRelease: () => void;
};

function fakeSentinel(): Sentinel {
  const listeners: (() => void)[] = [];
  const sentinel: Sentinel = {
    released: false,
    release: () => {
      sentinel.released = true;
      return Promise.resolve();
    },
    addEventListener: (type, listener) => {
      if (type === 'release') listeners.push(listener);
    },
    fireRelease: () => {
      sentinel.released = true;
      for (const listener of listeners) listener();
    },
  };
  return sentinel;
}

/** Installs a wakeLock that hands out `sentinels`, and reports the calls. */
function install(request: () => Promise<Sentinel>): { calls: () => number } {
  let calls = 0;
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async () => {
        calls += 1;
        return request();
      },
    },
  });
  return { calls: () => calls };
}

/** Lets an in-flight wakeLock request settle inside act(). */
const flush = (): Promise<void> =>
  act(async () => {
    await Promise.resolve();
  });

function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  // @ts-expect-error -- removing the stand-in is the point; the real one is absent in jsdom.
  delete navigator.wakeLock;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('reports unsupported and asks for nothing where there is no API', () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current.supported).toBe(false);
    expect(result.current.held).toBe(false);
  });

  it('takes a lock while the session is live', async () => {
    const sentinel = fakeSentinel();
    install(() => Promise.resolve(sentinel));

    const { result } = renderHook(() => useWakeLock(true));
    await flush();

    expect(result.current.held).toBe(true);
    expect(sentinel.released).toBe(false);
  });

  it('asks for nothing while the session is not live', async () => {
    const { calls } = install(() => Promise.resolve(fakeSentinel()));

    renderHook(() => useWakeLock(false));
    await flush();

    expect(calls()).toBe(0);
  });

  it('retakes the lock the platform drops when the tab is hidden', async () => {
    const first = fakeSentinel();
    const second = fakeSentinel();
    const queue = [first, second];
    const { calls } = install(() => Promise.resolve(queue.shift() ?? fakeSentinel()));

    const { result } = renderHook(() => useWakeLock(true));
    await flush();
    expect(calls()).toBe(1);

    // What the platform actually does on hide: releases it, silently.
    act(() => {
      first.fireRelease();
      setVisibility('hidden');
    });
    expect(result.current.held).toBe(false);

    act(() => {
      setVisibility('visible');
    });
    await flush();
    expect(calls()).toBe(2);
    expect(result.current.held).toBe(true);
  });

  it('does not ask while the tab is hidden — the request would only be refused', async () => {
    const { calls } = install(() => Promise.resolve(fakeSentinel()));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });

    renderHook(() => useWakeLock(true));
    await flush();

    expect(calls()).toBe(0);
  });

  it('treats a refusal as a normal outcome, not an error', async () => {
    install(() => Promise.reject(new Error('NotAllowedError')));

    const { result } = renderHook(() => useWakeLock(true));
    await flush();

    expect(result.current.held).toBe(false);
    expect(result.current.supported).toBe(true);
  });

  it('releases the lock when the session ends', async () => {
    const sentinel = fakeSentinel();
    install(() => Promise.resolve(sentinel));

    const { result, unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(result.current.held).toBe(true);

    unmount();
    expect(sentinel.released).toBe(true);
  });

  it('releases a lock that arrives after the session ended', async () => {
    // The request is in flight when the screen unmounts. Without the cancelled
    // guard this sentinel would be held with nobody left to release it.
    let resolve: ((sentinel: Sentinel) => void) | null = null;
    install(
      () =>
        new Promise<Sentinel>((settle) => {
          resolve = settle;
        }),
    );

    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();

    const sentinel = fakeSentinel();
    act(() => {
      resolve?.(sentinel);
    });
    await flush();

    expect(sentinel.released).toBe(true);
  });
});
