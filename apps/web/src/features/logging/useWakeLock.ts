import { useEffect, useState } from 'react';

/**
 * Holds the screen awake while a session is running.
 *
 * A phone that sleeps between sets is a real problem, not a nicety: you put it
 * down, do the set, and pick it up to a lock screen and a lost rest countdown.
 *
 * Two things about the platform shape this:
 *
 * - The lock is **released automatically** whenever the page is hidden, and it
 *   is not restored on return. So visibility is watched and the lock retaken —
 *   without that, one glance at another app ends it for the rest of the
 *   workout.
 * - `request()` rejects rather than resolving falsy when the OS refuses it
 *   (battery saver, a background tab, no user activation yet). That is a
 *   normal outcome, not an error to report: the rest timer's notification is
 *   the backstop that works with the screen off, so a refused lock costs
 *   convenience and nothing else.
 *
 * Safari has no Screen Wake Lock API at all, hence the capability check rather
 * than a try around a call that would throw on a missing property.
 */

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export type WakeLockState = {
  /** The platform offers the API. False on Safari and in plain HTTP. */
  supported: boolean;
  /** A lock is held right now. Flips to false whenever the tab is hidden. */
  held: boolean;
};

export function useWakeLock(active: boolean): WakeLockState {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !supported()) return;

    // Guards the async gap: a request in flight when the effect tears down
    // would otherwise resolve into a lock nobody releases.
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const release = (): void => {
      const current = sentinel;
      sentinel = null;
      setHeld(false);
      // Already released by the platform on hide; releasing twice is a no-op
      // that rejects, so the failure is swallowed rather than reported.
      if (current !== null && !current.released) void current.release().catch(() => undefined);
    };

    const acquire = async (): Promise<void> => {
      if (sentinel !== null || document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setHeld(true);
        // The platform drops the lock on hide and on its own initiative; the
        // listener is what keeps `held` honest rather than optimistic.
        next.addEventListener('release', () => {
          if (sentinel === next) {
            sentinel = null;
            setHeld(false);
          }
        });
      } catch {
        // Refused. The countdown on screen and the worker's notification both
        // still work, so there is nothing to tell anyone.
        setHeld(false);
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);

  return { supported: supported(), held };
}
