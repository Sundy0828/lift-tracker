import { useEffect, useState } from 'react';
import type { Rest } from './useRestTimer';

/**
 * The ticking half of the rest timer.
 *
 * It lives here rather than in `useRestTimer` because it re-renders twice a
 * second, and the hook that owns the deadline sits above the whole set grid
 * (§3). Only the small components that draw a clock use this one.
 *
 * Past zero `left` goes negative and `isOver` turns true, so a rest that ran
 * long says by how much instead of vanishing.
 */
export type RestCountdown = {
  /** Whole seconds left. Negative once the rest has run out. */
  left: number;
  isOver: boolean;
};

const STOPPED: RestCountdown = { left: 0, isOver: false };

export function useRestCountdown(rest: Rest | null): RestCountdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (rest === null) return;

    // Every 500 ms rather than 1000: a whole-second readout driven off a
    // 1000 ms interval visibly skips numbers as the two drift apart.
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);

    // Resynced when the screen comes back, so the number is right on the frame
    // the user actually sees rather than up to half a second later.
    const resync = (): void => {
      setNow(Date.now());
    };
    document.addEventListener('visibilitychange', resync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', resync);
    };
  }, [rest]);

  if (rest === null) return STOPPED;

  const left = Math.ceil((rest.endsAt - now) / 1000);
  return { left, isOver: left <= 0 };
}
