/**
 * The code on a Firebase error, without the SDK's packaging.
 *
 * The web SDK throws `FirebaseError` with codes like `permission-denied`
 * (Firestore) or `auth/user-not-found`. The native SDK throws its own class,
 * and prefixes Firestore codes with the module: `firestore/permission-denied`.
 * `instanceof FirebaseError` therefore never matches on mobile; reading the
 * code does, on both.
 */
export function firestoreErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const { code } = error;
  if (typeof code !== 'string') return null;
  return code.startsWith('firestore/') ? code.slice('firestore/'.length) : code;
}
