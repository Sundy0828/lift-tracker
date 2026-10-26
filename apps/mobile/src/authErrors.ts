/**
 * A sentence for an auth failure. The codes are the same on the web and
 * native SDKs (`auth/...`), so this matches what the web sign-in shows.
 */
export function authMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match an account.';
    case 'auth/invalid-email':
      return 'That is not a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account already uses that email. Sign in instead.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Signing in needs the internet once; after that the app works offline.';
    default:
      return error instanceof Error ? error.message : 'Something went wrong. Try again.';
  }
}
