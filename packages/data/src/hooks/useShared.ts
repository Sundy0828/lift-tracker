import { useCallback, useSyncExternalStore } from 'react';

/**
 * One Firestore listener per query, however many screens read it.
 *
 * Every data hook used to open its own listener and start out "pending", so
 * each screen showed a spinner until its listener's first snapshot came back,
 * even when the same data was already in memory under another listener
 * (`PrimeCache` holds workouts, the schedule and the profile open for the whole
 * session). On a phone that first snapshot crosses the native bridge, and the
 * wait was on every screen, every time.
 *
 * Here the listener is shared by key and keeps its latest value, so a screen
 * that mounts later reads the current data on its first render: no pending
 * state, no spinner. The listener stops a while after its last reader leaves,
 * so moving back and forth between two screens does not tear it down and
 * start it again each time. Its last value stays: on the next start it is
 * shown at once and replaced by the fresh snapshot, which is what the local
 * cache would have answered anyway.
 *
 * `start` must open the listener and return its unsubscribe, and must be stable
 * for a key (wrap it in `useCallback` on the values that make up the key):
 * one key is one query, and only the first reader's `start` is used.
 */

/** How long a listener outlives its last reader. Long enough to cover a round trip between screens. */
export const IDLE_MS = 30_000;

type Entry = {
  has: boolean;
  value: unknown;
  readers: Set<() => void>;
  stop: (() => void) | null;
  idle: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();

function entryFor(key: string): Entry {
  let entry = entries.get(key);
  if (entry === undefined) {
    entry = { has: false, value: undefined, readers: new Set(), stop: null, idle: null };
    entries.set(key, entry);
  }
  return entry;
}

/**
 * The latest value of the shared listener for `key`, or undefined until it
 * has produced one. A null key reads nothing (signed out, no id yet).
 */
export function useSharedSubscription<T>(
  key: string | null,
  start: (emit: (value: T) => void) => () => void,
): T | undefined {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (key === null) return () => undefined;
      const entry = entryFor(key);

      if (entry.idle !== null) {
        clearTimeout(entry.idle);
        entry.idle = null;
      }
      entry.readers.add(notify);
      entry.stop ??= start((value) => {
        entry.value = value;
        entry.has = true;
        for (const reader of entry.readers) reader();
      });

      return () => {
        entry.readers.delete(notify);
        if (entry.readers.size > 0 || entry.stop === null) return;
        entry.idle = setTimeout(() => {
          entry.idle = null;
          if (entry.readers.size > 0) return;
          entry.stop?.();
          entry.stop = null;
        }, IDLE_MS);
      };
    },
    [key, start],
  );

  const read = useCallback((): T | undefined => {
    if (key === null) return undefined;
    const entry = entries.get(key);
    return entry?.has === true ? (entry.value as T) : undefined;
  }, [key]);

  return useSyncExternalStore(subscribe, read, read);
}

/** Test-only: stop every listener and forget every value. */
export function resetSharedForTests(): void {
  for (const entry of entries.values()) {
    if (entry.idle !== null) clearTimeout(entry.idle);
    entry.stop?.();
  }
  entries.clear();
}
