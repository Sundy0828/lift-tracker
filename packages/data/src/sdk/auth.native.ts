import type { Auth, User } from '@react-native-firebase/auth';

/**
 * Every Firebase Auth function and type `@lift/data` uses, from one place.
 *
 * This is the mobile build: `@react-native-firebase/auth`. Web uses `auth.ts`
 * beside it, which re-exports the same names from the Firebase JS SDK. The two
 * must stay identical; `tsconfig.native.json` checks the whole package against
 * this one.
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
} from '@react-native-firebase/auth';
export type { Auth, User } from '@react-native-firebase/auth';

/*
 * Google needs a native sign-in library and an OAuth client per platform
 * (MOBILE_PLAN, Phase 2). Until then these reject with Firebase's own code for
 * "not supported here", so callers can treat it like any other auth error.
 */
function notYet(): Promise<never> {
  return Promise.reject(
    Object.assign(new Error('Google sign-in is not available in the app yet.'), {
      code: 'auth/operation-not-supported-in-this-environment',
    }),
  );
}

export const signInWithGoogle: (auth: Auth) => Promise<void> = notYet;

export const linkGoogle: (user: User) => Promise<void> = notYet;

export const reauthenticateWithGoogle: (user: User) => Promise<void> = notYet;
