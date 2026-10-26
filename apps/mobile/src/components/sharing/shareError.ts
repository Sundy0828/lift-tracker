import { firestoreErrorCode } from '@lift/data/sdk/errors';

/**
 * A failed share write, as something a person can act on. The web's
 * `describeShareError`, reading the code the way both SDKs carry it.
 */
export function describeShareError(error: unknown, fallback: string): string {
  const code = firestoreErrorCode(error);
  switch (code) {
    case null:
      return fallback;
    // A dev build older than the JS: say so, rather than a generic failure.
    case 'app/needs-new-build':
      return error instanceof Error ? error.message : fallback;
    case 'permission-denied':
      return 'Firestore refused this. The project rules are older than firestore.rules — deploy them with `firebase deploy --only firestore:rules`.';
    case 'unavailable':
      return 'Could not reach Firestore. This write needs the server, so try again when you are back online.';
    case 'unauthenticated':
      return 'Your sign-in has expired. Sign in again and retry.';
    default:
      return `${fallback} (${code})`;
  }
}
