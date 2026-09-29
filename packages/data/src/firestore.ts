import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { app, useEmulators } from './firebase';

/**
 * The Firestore instance, kept in its own module so the SDK stays out of the
 * entry chunk (see ./firebase). Everything that reaches this module is behind
 * a lazy route or a dynamic import.
 *
 * The persistent cache *is* the offline sync queue: writes apply to the local
 * cache immediately and flush on reconnect, so no custom sync layer is needed.
 * The multi-tab manager keeps two open tabs from fighting over the IndexedDB
 * lease.
 */
export const db: Firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (useEmulators) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
