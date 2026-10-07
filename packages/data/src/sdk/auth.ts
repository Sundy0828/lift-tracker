import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';

/**
 * Every Firebase Auth function and type `@lift/data` uses, from one place.
 *
 * This is the web build: the Firebase JS SDK. On mobile, Metro picks
 * `auth.native.ts` beside it, which re-exports the same names from
 * `@react-native-firebase/auth`. The two must stay identical;
 * `tsconfig.native.json` checks the whole package against the native one.
 */
export {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  unlink,
  updatePassword,
} from 'firebase/auth';
export type { Auth, User } from 'firebase/auth';

/*
 * Google, through a popup. The resolver is passed per call rather than at
 * `initializeAuth`, so the Google sign-in iframe loads when somebody taps
 * "Continue with Google" and not on every visit (see `../firebase.ts`).
 */
const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(auth: Auth): Promise<void> {
  await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
}

export async function linkGoogle(user: User): Promise<void> {
  await linkWithPopup(user, googleProvider, browserPopupRedirectResolver);
}

export async function reauthenticateWithGoogle(user: User): Promise<void> {
  await reauthenticateWithPopup(user, googleProvider, browserPopupRedirectResolver);
}
