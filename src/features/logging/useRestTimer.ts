import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelRestNotification, scheduleRestNotification } from './notifications';

/**
 * The rest timer's *state* — a deadline, the set that earned it, and the
 * controls that set them.
 *
 * A deadline rather than a decrementing counter: backgrounding the tab
 * throttles or freezes timers, so a counter would drift by however long the
 * phone spent in a pocket, while a deadline recomputes correctly the moment
 * the screen comes back — which is exactly when it is read.
 *
 * **Each rest belongs to the set that started it.** Without that, un-ticking
 * any set killed the countdown, so correcting a mis-tap on set 3 threw away
 * the rest that set 2 was still owed. With an owner, un-ticking a set only
 * ends the rest if it was *that* set's rest, and the screen can hand the
 * timer back to the set before it — resumed from when that set actually
 * finished, not from now, so the clock stays honest.
 *
 * **Nothing here ticks.** The countdown re-renders twice a second, and this
 * hook lives on the active-session screen, so ticking here would re-render
 * every set row twice a second and undo the memoization the set grid depends
 * on (§3). The ticking belongs to `RestTimerBar`.
 */

/** Which set a rest is owed to. */
export type RestOwner = { entryKey: string; setIndex: number };

export type Rest = {
  /** Epoch milliseconds. */
  endsAt: number;
  /** What was originally asked for, so the progress bar has a denominator. */
  total: number;
  /** What is next, shown on screen and in the notification. */
  label: string;
  owner: RestOwner;
};

export type RestTimer = {
  rest: Rest | null;
  /** Starts a rest now, owed to `owner`. */
  start: (seconds: number, label: string, owner: RestOwner) => void;
  /**
   * Starts a rest that began earlier, at `from` (an ISO instant). Used when a
   * rest falls back to an earlier set: what is left is the rest minus however
   * long ago that set was finished. A rest already elapsed simply clears.
   */
  resumeFrom: (from: string, seconds: number, label: string, owner: RestOwner) => void;
  /** True when the running rest is owed to this set. Stable across renders. */
  isOwnedBy: (owner: RestOwner) => boolean;
  /** Adds (or, negative, removes) seconds from a running rest. */
  adjust: (seconds: number) => void;
  stop: () => void;
};

function sameOwner(a: RestOwner, b: RestOwner): boolean {
  return a.entryKey === b.entryKey && a.setIndex === b.setIndex;
}

export function useRestTimer(): RestTimer {
  const [rest, setRest] = useState<Rest | null>(null);

  /**
   * A mirror of the state, so `isOwnedBy` can be read from an event handler
   * without the handler having to depend on the current rest — the set-row
   * handlers have to stay stable for `memo` to hold.
   */
  const current = useRef<Rest | null>(null);
  useEffect(() => {
    current.current = rest;
  }, [rest]);

  const begin = useCallback((endsAt: number, total: number, label: string, owner: RestOwner) => {
    // A rest of zero is a circuit flowing into its next exercise, and a rest
    // that already elapsed is simply over. Neither is a countdown to watch.
    if (total <= 0 || endsAt <= Date.now()) {
      setRest(null);
      current.current = null;
      void cancelRestNotification();
      return;
    }

    const next: Rest = { endsAt, total, label, owner };
    setRest(next);
    current.current = next;
    void scheduleRestNotification(endsAt, label);
  }, []);

  const start = useCallback(
    (seconds: number, label: string, owner: RestOwner) => {
      begin(Date.now() + seconds * 1000, seconds, label, owner);
    },
    [begin],
  );

  const resumeFrom = useCallback(
    (from: string, seconds: number, label: string, owner: RestOwner) => {
      const startedAt = Date.parse(from);
      if (Number.isNaN(startedAt)) {
        begin(Date.now() + seconds * 1000, seconds, label, owner);
        return;
      }
      begin(startedAt + seconds * 1000, seconds, label, owner);
    },
    [begin],
  );

  const isOwnedBy = useCallback(
    (owner: RestOwner) => current.current !== null && sameOwner(current.current.owner, owner),
    [],
  );

  const adjust = useCallback((seconds: number) => {
    setRest((running) => {
      if (running === null) return null;
      const endsAt = Math.max(Date.now(), running.endsAt + seconds * 1000);
      void scheduleRestNotification(endsAt, running.label);
      const next = { ...running, endsAt, total: Math.max(1, running.total + seconds) };
      current.current = next;
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setRest(null);
    current.current = null;
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

  return { rest, start, resumeFrom, isOwnedBy, adjust, stop };
}
