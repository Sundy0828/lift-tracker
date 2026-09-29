/**
 * The Vite env vars `firebase.ts` reads. Declared here rather than through
 * `vite/client`, so the shared package does not depend on the web bundler.
 * The web app's own `vite-env.d.ts` declares the same shape for its build.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
