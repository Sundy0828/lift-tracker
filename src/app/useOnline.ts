import { useSyncExternalStore } from 'react';

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` is a weak signal — it reports the link, not whether
 * anything at the other end answers, so it says `true` on hotel wifi that goes
 * nowhere. That is fine for what it is used for here: an honest hint that
 * explains why something did not load, never a gate on any action. Logging
 * works offline by design (§2.8) and nothing in the app waits on this.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** Server rendering has no navigator; assume connected. */
function getServerSnapshot(): boolean {
  return true;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
