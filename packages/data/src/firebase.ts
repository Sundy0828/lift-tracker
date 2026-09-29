import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

/**
 * App + Auth only. This module is on the first-paint path (the auth gate needs
 * it), so it must never import `firebase/firestore` — that SDK is ~149 kB
 * gzipped, larger than the whole initial-JS budget in §3. The Firestore
 * instance lives in `./firestore`, which is only reachable from lazy chunks.
 */

const options: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

export const app: FirebaseApp = initializeApp(options);

/**
 * `initializeAuth` rather than `getAuth`, for one difference: no
 * `popupRedirectResolver`.
 *
 * `getAuth` attaches one, and attaching it loads the Google sign-in iframe
 * from `apis.google.com` during startup — a third-party request and ~155 ms of
 * main thread on a throttled mobile profile, on every visit, to support a
 * redirect flow this app does not use. The popup calls pass the resolver
 * themselves, so it now loads when somebody taps "Continue with Google".
 *
 * The persistence list is the one `getAuth` uses; nothing else changes.
 */
export const auth: Auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});

export const googleProvider = new GoogleAuthProvider();

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
