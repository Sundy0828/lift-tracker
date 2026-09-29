// @vitest-environment jsdom
// The suite defaults to node; see vite.config.ts.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstallPrompt } from './useInstallPrompt';

/**
 * The offer's manners, which are the whole of its behaviour: it appears only
 * when the browser says the app is installable, it goes away when told, and it
 * stays away on the next launch.
 *
 * `beforeinstallprompt` cannot be triggered in a test browser, so it is
 * dispatched by hand — which is also the only way to cover the paths that
 * matter (a dismissal being remembered, a spent event not being reusable).
 */

type Choice = 'accepted' | 'dismissed';

function fireInstallable(outcome: Choice = 'accepted'): { prompted: () => number } {
  let prompted = 0;
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: () => {
      prompted += 1;
      return Promise.resolve();
    },
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return { prompted: () => prompted };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('useInstallPrompt', () => {
  it('offers nothing until the browser says the app is installable', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.available).toBe(false);
  });

  it('becomes available once the event fires', () => {
    const { result } = renderHook(() => useInstallPrompt());

    act(() => {
      fireInstallable();
    });

    expect(result.current.available).toBe(true);
  });

  it('suppresses the browser default so the offer is ours to time', () => {
    renderHook(() => useInstallPrompt());

    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    act(() => {
      window.dispatchEvent(event);
    });

    // Without this the browser paints its own mini-infobar over the app.
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows the platform dialog once and reports the choice', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    let prompted = (): number => 0;
    act(() => {
      ({ prompted } = fireInstallable('accepted'));
    });

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.install();
    });

    expect(outcome).toBe('accepted');
    expect(prompted()).toBe(1);
    // The event is spent: a captured prompt can only be shown once.
    expect(result.current.available).toBe(false);
  });

  it('reports unavailable rather than throwing when there is nothing to show', async () => {
    const { result } = renderHook(() => useInstallPrompt());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.install();
    });

    expect(outcome).toBe('unavailable');
  });

  it('remembers a dismissal, so the offer does not come back next launch', () => {
    const first = renderHook(() => useInstallPrompt());
    act(() => {
      fireInstallable();
    });
    expect(first.result.current.available).toBe(true);

    act(() => {
      first.result.current.dismiss();
    });
    expect(first.result.current.available).toBe(false);

    // A fresh mount is the next launch.
    const second = renderHook(() => useInstallPrompt());
    act(() => {
      fireInstallable();
    });
    expect(second.result.current.available).toBe(false);
  });

  it('remembers a dialog the person dismissed, not just our own button', async () => {
    const first = renderHook(() => useInstallPrompt());
    act(() => {
      fireInstallable('dismissed');
    });
    await act(async () => {
      await first.result.current.install();
    });

    const second = renderHook(() => useInstallPrompt());
    act(() => {
      fireInstallable();
    });
    expect(second.result.current.available).toBe(false);
  });

  it('stops offering once the app reports itself installed', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      fireInstallable();
    });

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.available).toBe(false);
  });

  it('survives storage that throws instead of crashing a dismiss button', () => {
    // Private mode and blocked site data both do this.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      fireInstallable();
    });
    expect(result.current.available).toBe(true);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.available).toBe(false);
  });
});
