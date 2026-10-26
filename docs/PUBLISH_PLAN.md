# Lift Tracker — Publish Plan

_As of 2026-10-25._ Follows [MOBILE_PLAN.md](MOBILE_PLAN.md), whose Phase 6 ("Release") this
document replaces. The `mobile` branch was merged to `master` before publishing was finished, so the
web gets the shared fixes now. This plan covers everything that was held back for this branch.

**How to use this document:** same rule as the other plans. Hand Claude one phase at a time. Each
phase leaves web deployable and `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.
Phases A and B are mostly console work for you; Claude does the code around them.

---

## 0. Decisions made

- [x] **Merge `mobile` first** (2026-10-25). Store work happens on its own branch.
- [x] **Phone sign-in is email and password only until social sign-in lands** (Phase D). Until
      then the phone keeps its guards: Google cannot be linked, and the password cannot be removed,
      from the app (`googleSignInAvailable()` in `packages/data/src/sdk/auth*.ts`,
      `SignInMethods.tsx`).
- [x] **Social sign-in: Apple, Facebook and Google together**, on both apps. Apple requires Sign in
      with Apple from any iOS app that offers another third-party login, so Apple ships first or
      with the others, never after.
- [x] **The e2e CI hang is fixed on this branch**, not before the merge (Phase G).
- [x] **Bodyweight scoring is per exercise.** Bodyweight exercises use the bodyweight formula at
      every load, so adding weight always scores higher. Stored records are rebuilt once after the
      deploy (§1).

---

## 1. Right after the merge deploys

The merge changes how bodyweight and assisted sets score, and the records stored in each account's
`exerciseStats` were written under the old scoring. Rebuild them once the new web is live:

- [x] Point `GOOGLE_APPLICATION_CREDENTIALS` at the service-account key (kept outside the repo),
      as for `negate-assisted` and `set-name`.
- [x] `pnpm run rebuild-records` (dry run; `--email you@example.com` for one account). Read the old
      → new list per account and exercise.
- [x] `pnpm run rebuild-records --apply`. _Done 2026-10-26: 3 records in 2 accounts (Dips - Chest
      Version 26.6 → 63.9 kg; first records for Tibialis Raise and Single-Leg Calf Raise, logged at
      0 kg). A second dry run found nothing left._
- [ ] Spot-check your own dips and pull-ups on History → Records, on the web and the phone.

---

## Phase A: Accounts, keys and identifiers

All console work. Nothing here can be done before the developer accounts exist.

- [ ] **Apple Developer and Play Console access** on the friend's accounts. There is no Mac and no
      iPhone here: builds go through EAS, and iOS testing happens on testers' phones through
      TestFlight.
- [ ] **Register the iOS app in Firebase** (bundle id `com.sundy0828.lifttracker`). Download
      `GoogleService-Info.plist` into `apps/mobile/`, and set `ios.googleServicesFile` to
      `./GoogleService-Info.plist` in `app.json`. **Without it every iOS EAS build fails at
      prebuild.** It holds public client ids, like `google-services.json`, so it is committed.
- [ ] **Web domain.** Keep `lift-tracker-e4a9c.web.app`, or move to a custom domain now, before any
      share link is out in the wild. A custom domain changes `extra.webOrigin`,
      `ios.associatedDomains` and the `android.intentFilters` hosts in `app.json`. If you move, list
      both hosts in the filters so old links keep working.
- [ ] **App links.** Fill the placeholders in `apps/web/public/.well-known/`:
  - `apple-app-site-association`: replace `REPLACE_WITH_TEAM_ID` with the Apple team id.
  - `assetlinks.json`: the SHA-256 of the Play App Signing key (Play Console → App integrity) and
    of the EAS upload key (`eas credentials`).
  - Deploy the web, then check with `adb shell pm get-app-links com.sundy0828.lifttracker` and by
    tapping a share link in Notes on an iPhone. Apple caches the file, so allow a day.
- [ ] **Restrict the Android API key** (Google Cloud → Credentials, the key in
      `google-services.json`): Android apps only, package `com.sundy0828.lifttracker` plus the
      signing SHA-1s, and only the Firebase APIs. Do the same for the iOS key once it exists.

**Exit:** an EAS iOS build gets past prebuild, and a share link opens the app on both platforms.

---

## Phase B: Store blockers in the app

- [ ] **App icon and splash.** `apps/mobile/assets/icon.png`, the three `android-icon-*.png` and
      `splash-icon.png` are still Expo's template (the blue "A" on graph paper). Apple rejects
      placeholder icons. Needed:
  - `icon.png`: 1024×1024, no transparency, no rounded corners (iOS adds them).
  - Android adaptive icon: foreground and monochrome layers with the mark inside the centre
    66% safe zone, plus a background colour or image.
  - Splash: the mark on the app's dark background, configured through the `expo-splash-screen`
    plugin in `app.json`.
  - Match the web's PWA icons (`apps/web/public/icons`) so the brand is one thing.
- [ ] **Privacy policy page** on the web, at `/privacy`, linked from Settings on both apps and from
      sign-up. Both stores require its URL. It has to say what is collected (email, first and last
      name, workouts, sessions, bodyweight, a Google/Apple/Facebook profile photo once linked),
      where it lives (Firebase, Google Cloud), that nothing is sold or used for ads or tracking, and
      how to delete it (Settings → Delete account, on either app).
- [ ] **Account deletion on the web.** Play requires a web page where a user can ask for deletion
      without reinstalling the app. Settings → Delete account on the web already does it; give it a
      stable URL (e.g. `/settings#delete`) and put that in the Play listing.
- [ ] **Export compliance.** Add `"ITSAppUsesNonExemptEncryption": false` under
      `ios.infoPlist` in `app.json`. The app uses only the OS's HTTPS, so this skips the export
      question on every TestFlight upload.
- [ ] **Expo SDK patch bump.** Lift the Expo Modules API 1.0 holds (`expo-application`,
      `expo-haptics`, `expo-notifications`, `expo-crypto`, the `overrides` in
      `pnpm-workspace.yaml`) together with an `expo` patch release, then confirm on a dev build
      that nothing reports "Cannot find native module".
- [ ] **Version numbers.** `version` in `app.json` is the store's marketing version (1.0.0); EAS
      manages build numbers remotely (`appVersionSource: remote`, `autoIncrement` in
      `apps/mobile/eas.json`). Nothing to do but know it.

**Exit:** `npx expo-doctor` is clean, and a production EAS build of each platform completes.

---

## Phase C: First beta builds and device checks

- [ ] `eas build --profile production` for both platforms, then `eas submit` to TestFlight and
      Play internal testing. Add the beta testers.
- [ ] **The checks nobody has run yet.** Each one was written blind (no iPhone, or no build since):
  - [ ] **Kill offline, relaunch online (iOS).** The Phase 0 check: log sets with the network off,
        kill the app, relaunch online, and see the sets in Firestore. If they are missing, stop and
        revisit the Firebase SDK choice before anything else.
  - [ ] **iOS rest alerts.** Lock mid-rest: three alerts (deadline, +25 s, +50 s), and they break
        through a Focus mode (time-sensitive).
  - [ ] **iOS Live Activity.** The countdown shows on the Lock Screen and in the Dynamic Island,
        and ends at the deadline.
  - [ ] **Done after a kill (both).** Kill the app mid-rest, press Done on the alert: the app opens
        on the session, the follow-up alerts stop, and the rest is recorded.
  - [ ] **Typing then tapping (both).** Type reps and tap ✓ at once; type a weight and tap Finish at
        once; type a rest length in the editor and tap Save or ←. Every number is kept.
  - [ ] **Swipe-kill (iOS).** Type a number, swipe the app away in the app switcher, reopen: kept.
  - [ ] **Email verification on the phone.** Sign up, tap the link, "I have confirmed it" lets you
        in without restarting the app.
  - [ ] **Sign out and back in within 30 s.** Lists update afterwards (a new workout appears).
  - [ ] **Phase 5 screens:** share link and friend QR open the app (needs Phase A), theme and
        accent survive a restart, export opens the share sheet with a file that opens in a
        spreadsheet, the calendar's month and year grids fit the phone.
- [ ] **Maestro.** Run `pnpm --filter @lift/mobile run e2e` against the emulators once
      (`apps/mobile/.maestro/README.md`). Expect selector fixes on the first run. All flows passing
      is MOBILE_PLAN Phase 5's exit.

**Exit:** a week of real workouts on the beta builds of both platforms with nothing lost.

---

## Phase D: Social sign-in (Apple, Facebook, Google)

Both apps, one phase. Shared code first, as always: every provider goes through
`packages/data/src/sdk/auth.ts` (web: popups) and `auth.native.ts` (phone: native SDKs).

**Console setup (you):**

- [ ] **Apple:** enable Sign in with Apple on the App ID; create a Services ID and key for the web
      and Android flows; enable the Apple provider in Firebase Auth with them.
- [ ] **Facebook:** a Meta developer app (Facebook Login), its app id and secret in Firebase Auth,
      and Firebase's OAuth redirect URI in the Meta app. Meta also wants a privacy policy URL and a
      data-deletion URL or instructions (Phase B's pages).
- [ ] **Google:** already enabled for the web. Add the SHA-1s of the EAS and Play signing keys to
      the Android app in Firebase, and download the updated config files.
- [ ] **One account per email** (Firebase Auth → Settings → User account linking). Keep it on, so
      signing in with Apple using the same address as an existing password account is refused
      with `auth/account-exists-with-different-credential` rather than making a second account.
      The app then says to sign in the old way and link the new one in Settings.

**Code (Claude):**

- [ ] Phone libraries: `expo-apple-authentication` (iOS), `@react-native-google-signin/google-signin`
      and `react-native-fbsdk-next`, each turned into a Firebase credential and passed to React
      Native Firebase's `signInWithCredential`, `linkWithCredential` and
      `reauthenticateWithCredential`. Apple on Android goes through Firebase's web-based OAuth
      flow. New native modules mean a new dev build.
- [ ] Web: Apple and Facebook popups beside the existing Google one.
- [ ] Sign-in screen: the three buttons on both apps, Apple's button styled per Apple's rules and
      placed at least as prominently as the others.
- [ ] Settings → Sign-in methods: link and unlink each provider; the last method still cannot be
      removed.
- [ ] Re-authentication before delete or password change works with every provider
      (`reauthMethod` grows `apple` and `facebook`).
- [ ] **Apple token revocation.** Apple requires an app to revoke the Sign in with Apple token when
      the account is deleted. Add it to `deleteAccount` before the login is deleted.
- [ ] Names: Apple gives the name only on the first sign-in, so store it then (the name prompt
      catches a miss). Apple's "Hide my email" addresses are real addresses; nothing to special-case.
- [ ] **Remove the phone-only guards:** `googleSignInAvailable()` returns true on the phone, the
      password "Remove" in `SignInMethods.tsx` is enabled again, and the "use the web" messages for
      Google go.
- [ ] Maestro and Playwright: at least the button renders and the cancel path; real provider sign-in
      cannot run in CI.

**Exit:** a new account made with each provider on each app, linked to a password and unlinked,
and deleted from the phone.

---

## Phase E: Store listings and review

- [ ] **Listing:** name, subtitle, description, keywords, category (Health & Fitness), support URL
      and marketing URL (the web app).
- [ ] **Screenshots:** iPhone 6.9" and 6.5", Android phone. Today, an active session with the rest
      bar, the workout editor, History records, the calendar.
- [ ] **Apple privacy labels** and **Play Data safety form.** Data linked to the user: email, name,
      fitness data (workouts and sessions), bodyweight, photos only as a linked account's profile
      picture. No tracking, no ads, no third-party sharing, encrypted in transit, deletable in the
      app.
- [ ] **Play `USE_EXACT_ALARM` declaration:** "The rest timer is the app's core feature; the alert
      has to arrive at the end of the rest, with the phone locked." If Play refuses, switch to
      `SCHEDULE_EXACT_ALARM` with a prompt to grant it in Settings.
- [ ] **Play closed testing.** A new personal developer account must run a closed test with at
      least 12 testers for 14 days before it can apply for production. Check whether the friend's
      account is subject to it, and start the clock early: it can overlap Phase D.
- [ ] **Apple review notes:** a demo account (email and password) with a few workouts and finished
      sessions, and a sentence on what the time-sensitive notification is for.
- [ ] Age rating questionnaires (no objectionable content) and content rating on Play.

**Exit:** both listings submitted for review.

---

## Phase F: Launch

- [ ] Set `VITE_IOS_APP_STORE_ID` and `VITE_ANDROID_PACKAGE` for the production web build and
      deploy. Safari then shows the Smart App Banner and Chrome offers the Play app instead of the
      PWA install.
- [ ] Open a share link and a friend QR on a phone with the app installed (opens the app) and
      without it (opens the web).
- [ ] Tick off Phase 6 in MOBILE_PLAN.md and point it here.

---

## Phase G: The e2e CI hang (side track)

`.github/workflows/e2e.yml` has been manual-only since 2026-10-02. On GitHub's Linux runners, and
never locally, the run hangs after the last test until the job times out. It passed on `master` in
7–10 minutes until the pnpm move, so the move is the likely cause.

Lead suspect: the Playwright `webServer` command in `apps/web/playwright.config.ts` changed from
`npm run build … && npm run preview …` to `pnpm run build … && pnpm run preview …`. When the tests
end, Playwright kills the process it started. If the `vite preview` that pnpm spawned survives
that, it keeps stdout open, and `firebase emulators:exec` waits for it forever.

- [ ] Run the workflow once by hand (`workflow_dispatch`) with `DEBUG=pw:webserver` to see whether
      the server is told to stop and whether it does.
- [ ] Try the server command without pnpm in the middle: call `vite build` and `vite preview`
      directly (or through `pnpm exec vite`), with the same flags.
- [ ] If it still hangs, list the processes left alive at the end (`ps -ef --forest` in an
      `if: always()` step) and go from there.
- [ ] Once a run finishes cleanly, restore the `push` and `pull_request` triggers.

**Exit:** two green e2e runs in a row on pull requests.

---

## Known small things (no phase)

- **Initial-JS budget:** 154.1 of 155 kB. The next eager import on the web's first paint fails
  `verify`. Look for something to make lazy before adding anything.
- **Old PWA clients.** A web client still on a pre-merge service worker drops timed, distance and
  assisted values if it rewrites a session made on a newer client. It clears once the update
  prompt is accepted. Nothing to do unless it shows up.
- **Recent exercise searches are per device, not per account**, on both apps. Fine for a personal
  phone; key them by account if shared devices matter.
- **Publishing a workout uses what is on screen**, so a name still being typed when Publish is
  tapped lands in the working copy a moment later, as an unpublished change. Nothing is lost.
