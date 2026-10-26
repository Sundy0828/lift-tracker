# Mobile e2e (Maestro)

The phone's counterpart of `apps/web/e2e`: one flow file per Playwright spec, covering the same
scenarios where a phone can drive them. **Written 2026-10-08 without a device to run them on**:
expect selector fixes on the first run.

## Running

1. Start the emulators under the **app's** project id (the native SDKs read it from
   `google-services.json`, not from an env var):

   ```sh
   firebase emulators:start --project lift-tracker-e4a9c --only auth,firestore
   ```

2. Build and install a dev or preview build pointed at them. On the Android emulator the host
   machine is `10.0.2.2`:

   ```sh
   EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=10.0.2.2 \
     npx eas-cli@latest build --profile development --platform android
   ```

3. Run the suite from `apps/mobile` (Maestro CLI installed, emulator or device attached):

   ```sh
   pnpm run e2e
   ```

The scripts talk to the Auth emulator from the host, at `http://127.0.0.1:9099` by default.
Override with `-e AUTH_EMULATOR=… -e PROJECT_ID=…`.

## Layout

- `flows/`: one file per web spec, in the same order as `apps/web/e2e`.
- `subflows/`: sign up (through the real verification link, as `signUp.ts` does), sign in,
  sign out, build a workout, dismiss the walkthrough.
- `scripts/`: the JavaScript the subflows run, in Maestro's engine (`http`, `json`, `output`).

Maestro matches `text` as a regular expression against both visible text and accessibility
labels, so a label with `?`, `+`, `(` or `.` is escaped.

## Not covered

- Drag to group and drag out of a circuit (`circuit-gestures.spec.ts`): Maestro has no
  hold-then-drag. The swipe actions are covered instead.
- The service worker and manifest checks in `smoke.spec.ts` and `offline.spec.ts`: web only.
- Lock-screen alerts, the Live Activity and the Android countdown: checked by hand (see
  MOBILE_PLAN, Phase 3).
