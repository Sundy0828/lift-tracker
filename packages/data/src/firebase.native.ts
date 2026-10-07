import { connectAuthEmulator, getAuth, type Auth } from '@react-native-firebase/auth';

/**
 * Auth for mobile. Web uses `firebase.ts`.
 *
 * No config object: the native SDKs read the project from
 * `google-services.json` / `GoogleService-Info.plist`, which the Expo config
 * plugin copies into the native projects at build time. Sign-in persists in
 * the platform keychain/keystore, so it survives the app being killed.
 */

// Inlined by Metro at bundle time. Declared here rather than through node
// types, which the shared package deliberately does not load.
declare const process: { env: Record<string, string | undefined> };

export const useEmulators = process.env['EXPO_PUBLIC_USE_FIREBASE_EMULATORS'] === 'true';

/**
 * Where the emulators run. A phone's `127.0.0.1` is the phone itself, so a
 * real device needs the dev machine's LAN address here.
 */
export const emulatorHost = process.env['EXPO_PUBLIC_FIREBASE_EMULATOR_HOST'] ?? '127.0.0.1';

export const auth: Auth = getAuth();

if (useEmulators) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
}
