/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
  /** The App Store id, once the app is listed: turns on Safari's Smart App Banner. */
  readonly VITE_IOS_APP_STORE_ID?: string;
  /** The Play package, once listed: Chrome offers the store app, and a banner links to it. */
  readonly VITE_ANDROID_PACKAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
