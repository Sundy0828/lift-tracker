import { describe, expect, it } from 'vitest';
import {
  NO_STORES,
  bannerFor,
  platformOf,
  relatedApplications,
  smartBannerTag,
  storesFrom,
} from './appStores';
import { buildManifest, manifest } from './manifest';

const listed = storesFrom({
  VITE_IOS_APP_STORE_ID: '123456789',
  VITE_ANDROID_PACKAGE: 'com.sundy0828.lifttracker',
});

const browsing = { standalone: false, installOfferShowing: false };

describe('the app store hand-off', () => {
  it('is entirely off until the app is listed', () => {
    expect(storesFrom({ VITE_IOS_APP_STORE_ID: ' ' })).toEqual(NO_STORES);
    expect(smartBannerTag(NO_STORES)).toBeNull();
    expect(relatedApplications(NO_STORES)).toEqual({});
    // Chrome must keep offering the PWA: there is no store app to prefer yet.
    expect(buildManifest(NO_STORES)).toEqual(manifest);
  });

  it('adds the Safari banner and the Play app once listed', () => {
    expect(smartBannerTag(listed)).toBe(
      '<meta name="apple-itunes-app" content="app-id=123456789" />',
    );
    const built = buildManifest(listed);
    expect(built.prefer_related_applications).toBe(true);
    expect(built.related_applications?.[0]?.id).toBe('com.sundy0828.lifttracker');
  });

  it('tells phones apart, iPadOS included', () => {
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other');
    expect(platformOf('Mozilla/5.0 (Linux; Android 16; Pixel 9)')).toBe('android');
  });

  it('offers the home screen on an iPhone until there is an App Store listing', () => {
    expect(bannerFor('ios', NO_STORES, browsing)).toBe('ios-home-screen');
    // Listed: Safari's own banner does it.
    expect(bannerFor('ios', listed, browsing)).toBeNull();
  });

  it('links Play on Android only when listed and Chrome is not already offering it', () => {
    expect(bannerFor('android', NO_STORES, browsing)).toBeNull();
    expect(bannerFor('android', listed, browsing)).toBe('play-store');
    expect(bannerFor('android', listed, { ...browsing, installOfferShowing: true })).toBeNull();
  });

  it('stays away once installed', () => {
    expect(bannerFor('ios', NO_STORES, { ...browsing, standalone: true })).toBeNull();
  });
});
