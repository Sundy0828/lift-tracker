import { FirebaseError } from 'firebase/app';

/**
 * Turns a failed share write into a message a person can act on.
 *
 * A share is the only document the app writes outside `users/{uid}`, so it is
 * the only write that stale project rules can refuse. `fallback` covers
 * everything with no specific cause.
 */
export function describeShareError(error: unknown, fallback: string): string {
  if (!(error instanceof FirebaseError)) return fallback;

  switch (error.code) {
    case 'permission-denied':
      return 'Firestore refused this. The project rules are older than firestore.rules — deploy them with `firebase deploy --only firestore:rules`.';
    case 'unavailable':
      return 'Could not reach Firestore. This write needs the server, so try again when you are back online.';
    case 'unauthenticated':
      return 'Your sign-in has expired. Sign in again and retry.';
    default:
      return `${fallback} (${error.code})`;
  }
}
