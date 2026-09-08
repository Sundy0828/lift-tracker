import { useCallback, useEffect, useState } from 'react';
import { cancelRestNotification, scheduleRestNotification } from './notifications';

/**
 * The rest timer's *state* — a deadline, and the controls that set it.
 *
 * A deadline rather than a decrementing counter: backgrounding the tab
 * throttles or freezes timers, so a counter would drift by however long the
 * phone spent in a pocket, while a deadline recomputes correctly the moment
 * the screen comes back — which is exactly when it is read.
 *
 * **Nothing here ticks.** The countdown re-renders twice a second, and this
 * hook lives on the active-session screen, so ticking here would re-render
 * every set row twice a second and undo the memoization the set grid depends
 * on (§3). The ticking belongs to `RestTimerBar`, which is the only thing that
 * needs to change. This state changes only when a rest starts, is adjusted, or
 * ends.
 *
 * The service worker gets the same deadline so the notification fires with the
 * screen off (see ./notifications). Nothing here waits on that.
 */

export type Rest = {
  /** Epoch milliseconds. */
  endsAt: number;
  /** What was originally asked for, so the progress bar has a denominator. */
  total: number;
  /** What is next, shown on screen and in the notification. */
  label: string;
};

export type RestTimer = {
  rest: Rest | null;
  start: (seconds: number, label: string) => void;
  /** Adds (or, negative, removes) seconds from a running rest. */
  adjust: (seconds: number) => void;
  stop: () => void;
};

export function useRestTimer(): RestTimer {
  const [rest, setRest] = useState<Rest | null>(null);

  const start = useCallback((seconds: number, label: string) => {
    // A rest of zero is a circuit flowing into its next exercise, not a
    // countdown to watch.
    if (seconds <= 0) {
      setRest(null);
      void cancelRestNotification();
      return;
    }

    const endsAt = Date.now() + seconds * 1000;
    setRest({ endsAt, total: seconds, label });
    void scheduleRestNotification(endsAt, label);
  }, []);

  const adjust = useCallback((seconds: number) => {
    setRest((current) => {
      if (current === null) return null;
      const endsAt = Math.max(Date.now(), current.endsAt + seconds * 1000);
      void scheduleRestNotification(endsAt, current.label);
      return { ...current, endsAt, total: Math.max(1, current.total + seconds) };
    });
  }, []);

  const stop = useCallback(() => {
    setRest(null);
    void cancelRestNotification();
  }, []);

  // A rest that outlived the screen it belongs to would buzz about a session
  // that is already finished.
  useEffect(
    () => () => {
      void cancelRestNotification();
    },
    [],
  );

  return { rest, start, adjust, stop };
}
