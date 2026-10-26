/**
 * Where the native app lives, if it has been listed yet, and the tags that
 * point a phone's browser at it (MOBILE_PLAN §0).
 *
 * Both ids come from the build's environment (`VITE_IOS_APP_STORE_ID`,
 * `VITE_ANDROID_PACKAGE`), so nothing changes until the app is actually in a
 * store. Until then every mechanism here is off and the PWA install offer is
 * the only one, which matters on Android: `prefer_related_applications`
 * makes Chrome offer the store app *instead of* installing the PWA, which
 * would be an offer of nothing before the listing exists.
 *
 * A module of its own, with no imports, because `vite.config.ts` reads it to
 * build the manifest and the HTML, and the app reads it for the banner.
 */

export type AppStores = {
  /** The App Store's numeric id, e.g. "6449123456". */
  iosAppId: string | null;
  /** The Play package name, e.g. "com.sundy0828.lifttracker". */
  androidPackage: string | null;
};

export const NO_STORES: AppStores = { iosAppId: null, androidPackage: null };

function present(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** The stores from a build environment, `import.meta.env` or Vite's `loadEnv`. */
export function storesFrom(env: Record<string, string | undefined>): AppStores {
  return {
    iosAppId: present(env['VITE_IOS_APP_STORE_ID']),
    androidPackage: present(env['VITE_ANDROID_PACKAGE']),
  };
}

export function playStoreUrl(androidPackage: string): string {
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidPackage)}`;
}

export function appStoreUrl(iosAppId: string): string {
  return `https://apps.apple.com/app/id${encodeURIComponent(iosAppId)}`;
}

/**
 * Safari's Smart App Banner. Safari knows whether the app is installed, so the
 * one tag shows "Open" or "View" on its own; nothing in the page has to check.
 */
export function smartBannerTag(stores: AppStores): string | null {
  if (stores.iosAppId === null) return null;
  return `<meta name="apple-itunes-app" content="app-id=${stores.iosAppId}" />`;
}

/** The manifest fields that make Chrome on Android offer the Play app. */
export function relatedApplications(stores: AppStores): {
  related_applications?: { platform: 'play'; id: string; url: string }[];
  prefer_related_applications?: boolean;
} {
  if (stores.androidPackage === null) return {};
  return {
    related_applications: [
      {
        platform: 'play',
        id: stores.androidPackage,
        url: playStoreUrl(stores.androidPackage),
      },
    ],
    prefer_related_applications: true,
  };
}

export type Platform = 'ios' | 'android' | 'other';

/**
 * Which phone a browser is on, from its user agent. iPadOS reports itself as
 * a Mac, so a Mac with a touch screen counts as iOS.
 */
export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/u.test(userAgent)) return 'ios';
  if (userAgent.includes('Macintosh') && maxTouchPoints > 1) return 'ios';
  if (userAgent.includes('Android')) return 'android';
  return 'other';
}

/**
 * The banner a visitor should see, if any.
 *
 * - Installed already (a standalone window): nothing.
 * - iOS with a listing: nothing; Safari's own banner does it (`smartBannerTag`).
 * - iOS without one: how to add the PWA to the home screen, which iOS never
 *   offers by itself.
 * - Android with a listing: a link to Play, unless Chrome's own install offer
 *   (for the store app, given `prefer_related_applications`) is showing.
 * - Anything else: nothing; Chrome's PWA install offer covers it.
 */
export type AppBannerKind = 'ios-home-screen' | 'play-store' | null;

export function bannerFor(
  platform: Platform,
  stores: AppStores,
  options: { standalone: boolean; installOfferShowing: boolean },
): AppBannerKind {
  if (options.standalone) return null;
  if (platform === 'ios') return stores.iosAppId === null ? 'ios-home-screen' : null;
  if (platform === 'android' && stores.androidPackage !== null && !options.installOfferShowing) {
    return 'play-store';
  }
  return null;
}
