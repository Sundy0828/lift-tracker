import { requireNativeModule } from 'expo';

/**
 * The rest countdown as an ongoing notification with a native countdown
 * (modules/rest-countdown). See ./restCountdown for the contract.
 */

type RestCountdownModule = {
  show: (endsAt: number, title: string, body: string) => void;
  hide: () => void;
};

let native: RestCountdownModule | null | undefined;

/**
 * Looked up on first use rather than at import, so a build without the module
 * (an older dev client) loses the countdown and nothing else.
 */
function module(): RestCountdownModule | null {
  if (native === undefined) {
    try {
      native = requireNativeModule<RestCountdownModule>('RestCountdown');
    } catch {
      native = null;
    }
  }
  return native;
}

export function showRestCountdown(endsAt: number, label: string): void {
  try {
    module()?.show(endsAt, 'Resting', label);
  } catch {
    // A refused notification costs the countdown, not the rest.
  }
}

export function hideRestCountdown(): void {
  try {
    module()?.hide();
  } catch {
    // Nothing to hide.
  }
}
