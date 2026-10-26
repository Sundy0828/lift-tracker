import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { emulatorHost, useEmulators } from './firebase';

/**
 * The Firestore instance for mobile. Web uses `firestore.ts`.
 *
 * The native SDKs keep the offline cache on disk by default, and that cache is
 * the sync queue: a write lands locally at once and flushes on reconnect, even
 * after the OS has killed the app in between (MOBILE_PLAN, Phase 0). So there
 * is nothing to configure here but the emulator.
 */
export const db = getFirestore();

if (useEmulators) {
  connectFirestoreEmulator(db, emulatorHost, 8080);
}
