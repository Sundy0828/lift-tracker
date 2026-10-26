import { useSyncExternalStore } from 'react';

/**
 * Whether the browser thinks it has a network.
 *
 * `navigator.onLine` is a weak signal — it reports the link, not whether
 * anything at the other end answers, so it says `true` on hotel wifi that goes
 * nowhere. It is mostly an honest hint that explains why something did not
 * load. Logging works offline by design (§2.8).
 *
 * Deleting a session is the one action it gates: that write rebuilds the
 * record indexes from a server read, which a cache-only read would get wrong.
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
