import { useCallback, useEffect, useState } from 'react';

/**
 * Chrome's install prompt, held until there is something worth interrupting for.
 *
 * `beforeinstallprompt` is not in the DOM lib because it is not a standard: it
 * is Chromium-only, and Safari installs from the share sheet with no event at
 * all. So this is declared locally rather than shimmed globally — a global
 * augmentation would imply the platform guarantees it, and it does not.
 *
 * The event must be captured the moment it fires and `preventDefault()`ed, or
 * the browser shows its own mini-infobar; `prompt()` can then be called later,
 * but only from a real user gesture and only once per event.
 */

type InstallChoice = { outcome: 'accepted' | 'dismissed' };

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

/** Remembers a "not now" so the offer does not come back every launch. */
const DISMISSED_KEY = 'lift-tracker.install-dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    // Private mode and blocked site data both throw. Offering again is the
    // harmless side of that failure.
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Nothing to do: the offer comes back next launch, which is only a
    // nuisance, and the alternative is a crash on a dismiss button.
  }
}

/**
 * Whether the app is already installed, as far as it can tell.
 *
 * There is no reliable "am I installed?" API — `getInstalledRelatedApps()` is
 * Chromium-only and needs a manifest relationship — so the display mode is the
 * signal: a standalone window means it was launched from a home screen.
 */
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

export type InstallPromptState = {
  /** True when the browser has offered an install and it has not been used. */
  available: boolean;
  /** Shows the browser's own dialog. Must be called from a user gesture. */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  /** Hides the offer and remembers the choice. */
  dismiss: () => void;
};

export function useInstallPrompt(): InstallPromptState {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => wasDismissed() || isStandalone());

  useEffect(() => {
    const capture = (raw: Event): void => {
      raw.preventDefault();
      setEvent(raw as BeforeInstallPromptEvent);
    };

    // Firing at all means the app is installable *and* not yet installed, so a
    // stale standalone reading cannot keep the offer suppressed forever.
    window.addEventListener('beforeinstallprompt', capture);

    // The event does not fire again after a successful install, and the app
    // keeps running in the tab it was installed from, so the offer is cleared
    // explicitly rather than left on screen.
    const installed = (): void => {
      setEvent(null);
      setHidden(true);
    };
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (event === null) return 'unavailable';
    await event.prompt();
    const { outcome } = await event.userChoice;
    // Spent either way: a captured event can only be prompted once.
    setEvent(null);
    if (outcome === 'dismissed') remember();
    setHidden(true);
    return outcome;
  }, [event]);

  const dismiss = useCallback((): void => {
    remember();
    setHidden(true);
  }, []);

  return { available: event !== null && !hidden, install, dismiss };
}
