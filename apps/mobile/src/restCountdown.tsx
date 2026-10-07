/**
 * The rest countdown outside the app: on the lock screen, and in the status
 * bar or Dynamic Island where the OS offers it.
 *
 * One file per platform, picked by Metro: `restCountdown.ios.tsx` is a Live
 * Activity, `restCountdown.android.ts` an ongoing notification with a native
 * countdown. In both, the OS ticks the clock itself from the deadline, so it
 * keeps time while the app is suspended or killed.
 *
 * This file is the fallback for any other platform, and does nothing. It is
 * `.tsx`, not `.ts`, on purpose: Metro tries every platform variant of one
 * extension before the next extension, so a plain `.ts` here would beat
 * `restCountdown.ios.tsx` and iOS would silently get the no-op. Like the
 * alerts, the countdown is a convenience: nothing may depend on it.
 */

/** Shows the countdown to `endsAt` (epoch ms), or moves an existing one there. */
export const showRestCountdown: (endsAt: number, label: string) => void = () => {
  // No lock-screen countdown on this platform.
};

/** Removes the countdown. Safe to call when none is showing. */
export const hideRestCountdown: () => void = () => {
  // Nothing was shown.
};
