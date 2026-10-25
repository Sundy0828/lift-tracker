import type AsyncStorageModule from '@react-native-async-storage/async-storage';

/**
 * Small per-phone preferences: recent searches, the colour scheme, the accent.
 *
 * AsyncStorage, loaded on first use rather than imported. Its module throws at
 * import when the native half is missing (a dev build older than the JS it
 * runs). Imported statically, that took a whole route down with it; loaded
 * here, it costs only the preference, which falls back to its default.
 *
 * Every helper swallows its failure for the same reason: none of these is
 * worth an error on screen.
 */

type Storage = typeof AsyncStorageModule;

let storage: Promise<Storage | null> | null = null;

function loadStorage(): Promise<Storage | null> {
  storage ??= import('@react-native-async-storage/async-storage').then(
    (module) => module.default,
    () => null,
  );
  return storage;
}

/** The stored string, or null when there is none or it cannot be read. */
export function readItem(key: string): Promise<string | null> {
  return loadStorage()
    .then((store) => store?.getItem(key) ?? null)
    .catch(() => null);
}

/** Stores `value`. A failed write costs the preference next launch, nothing more. */
export function writeItem(key: string, value: string): void {
  loadStorage()
    .then((store) => store?.setItem(key, value))
    .catch(() => undefined);
}
