/**
 * The in-app end-of-rest alert: a vibration and an optional tone.
 *
 * This is the case the service worker's notification does *not* cover. A
 * notification is suppressed by most browsers while the page is in the
 * foreground, and the phone is far more often face-up on a bench than in a
 * pocket — so the page raises its own alert, and repeats it, until the rest is
 * dealt with.
 *
 * Everything degrades to nothing. No vibration motor, a blocked audio context,
 * or a browser that has neither all leave the countdown working.
 */

/** Long-short-long. Distinct from a message buzz at arm's length. */
const PATTERN: readonly number[] = [180, 90, 180, 90, 300];

export function buzz(): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate([...PATTERN]);
  } catch {
    // A refused vibration costs the alert, not the timer.
  }
}

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

let context: AudioContext | null = null;

/**
 * Two short tones, synthesised rather than loaded.
 *
 * An oscillator costs no asset, no request and no cache entry, which matters
 * more here than timbre does — this plays for half a second between sets.
 *
 * The context is created on first use and kept: a page that has been
 * interacted with may create one, and creating one per rest leaks them.
 */
export function chime(): void {
  const Ctor = audioContextCtor();
  if (Ctor === null) return;

  try {
    context ??= new Ctor();
    // Suspended is the normal state after the tab has been backgrounded.
    void context.resume();

    const start = context.currentTime;
    for (const [index, frequency] of [880, 1175].entries()) {
      const at = start + index * 0.18;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      // Ramped rather than switched, so it does not click on either end.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.18);
    }
  } catch {
    // An audio context the browser will not start costs the tone only.
  }
}
