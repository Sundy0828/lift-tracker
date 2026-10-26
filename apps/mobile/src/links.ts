import Constants from 'expo-constants';
import type { Href } from 'expo-router';
import { Share } from 'react-native';

/**
 * The links the app hands out: a shared workout and a friend code.
 *
 * Both point at the **web** app, never at the app's own scheme. A link is
 * pasted into a chat or printed as a QR, and whoever opens it may not have the
 * app. With it installed, the OS opens it here instead (app links on Android,
 * universal links on iOS; `app.json` and `apps/web/public/.well-known`), and
 * expo-router lands on the same path: `/share/:id` or `/friend/:code`.
 *
 * The origin is `extra.webOrigin` in `app.json`, the one place it is written.
 */

const FALLBACK_ORIGIN = 'https://lift-tracker-e4a9c.web.app';

function webOrigin(): string {
  const value: unknown = Constants.expoConfig?.extra?.['webOrigin'];
  return typeof value === 'string' && value.startsWith('https://') ? value : FALLBACK_ORIGIN;
}

export function shareUrl(shareId: string): string {
  return `${webOrigin()}/share/${shareId}`;
}

export function friendUrl(code: string): string {
  return `${webOrigin()}/friend/${code}`;
}

/**
 * Opens the phone's share sheet with `text`. It has Copy on it, and every app
 * the link might go to, which is what a Copy button on the web stands in for.
 * Dismissing it is not an error.
 */
export function shareText(text: string): void {
  Share.share({ message: text }).catch(() => undefined);
}

/**
 * Where to go once signed in, from the `from` a gated screen passed to
 * sign-in. Only the two paths a link can open are honoured, so a crafted
 * link cannot send a fresh sign-in anywhere else in the app.
 */
export function returnPath(from: string | undefined): Href {
  if (from !== undefined && /^\/(share|friend)\/[\w-]+$/u.test(from)) return from;
  return '/';
}
