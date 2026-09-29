# Lift Tracker — Web + Mobile Build Plan

_As of 2026-09-22._ Companion to [BUILD_PLAN.md](BUILD_PLAN.md), which covers the web PWA. This
document covers the move to a `web` / `mobile` / shared monorepo and the native mobile app.

**How to use this document:** same rule as BUILD_PLAN.md. Hand Claude one phase at a time. Each
phase leaves web deployable and the root gates green.

---

## 0. Decisions made (2026-09-22)

- [x] **Option B**: monorepo with `web`, `mobile` and shared packages. Web stays the Vite PWA.
      Mobile is a new Expo app with a native UI. No Capacitor detour.
- [x] **Firebase SDK on mobile** (2026-09-28): `@react-native-firebase`. The JS SDK's Firestore
      cache is memory only on React Native, so a queued write dies with the app. The native SDKs
      persist to disk by default. Decided from documentation, not from an iPhone test. See Phase 0.
- [x] **Package manager**: pnpm workspaces.
- [x] **First release**: iOS and Android together. React Native carries nearly everything; expect a
      couple of small native implementations behind the platform adapter.
- [x] **Web → store hand-off**: not a redirect. The web app cannot tell whether the native app is
      installed, and React Native cannot answer that for a web page either. Use what the OS provides:
  - iOS Safari: the `apple-itunes-app` meta tag shows the Smart App Banner. Safari knows whether the
    app is installed and shows "Open" or "View".
  - Android Chrome: `related_applications` with the Play package id and
    `prefer_related_applications: true` in the web manifest. Chrome then offers the native app
    instead of installing the PWA.
  - Share links: universal links (iOS) and app links (Android) open the app when installed and fall
    back to the web page when not. Nothing in the page has to check.

---

## 1. Where the app stands today

The repo is already split the way a shared-code project needs. About 13,200 lines of pure
TypeScript sit in `src/domain/` with no React and no Firebase imports. That code moves to mobile
as-is. The UI (`src/features/`, ~14,300 lines, plus `src/app/`, ~1,400 lines) is written against
Mantine in 66 files. That code does not move to mobile.

| Layer                                                           | Lines       | Depends on                      | Portable to React Native?      |
| --------------------------------------------------------------- | ----------- | ------------------------------- | ------------------------------ |
| `src/domain/` (overlay, strength, volume, diff, sharing, tests) | ~13,200     | nothing                         | Yes, unchanged                 |
| `src/catalog/` (bundled exercise data + search index)           | ~400 + JSON | nothing                         | Yes, unchanged                 |
| `src/data/` (Firebase converters, hooks, mutations)             | ~3,800      | Firebase JS SDK, React          | Mostly, behind a small adapter |
| `src/features/` (screens)                                       | ~14,300     | Mantine, dnd-kit, CSS modules   | No, rewrite per screen         |
| `src/app/` (router, PWA shell, service worker)                  | ~1,400      | Vite PWA, Workbox, react-router | No, web only                   |

The web app already has a rest timer, a service-worker notification and dnd-kit reordering. The
limits are the browser's, not the code's:

- **Rest timer and clock.** iOS suspends a backgrounded tab's JavaScript. The service worker in
  `src/sw.ts` is a best-effort workaround, and it only fires if the PWA is installed.
- **Notifications.** iOS delivers web push only to an installed PWA. Sticky, repeating and
  action-button behavior is inconsistent across browsers.
- **Drag and drop.** dnd-kit fights the browser's scroll and long-press gestures on touch. There is
  no haptic feedback and no native reorder animation.

Everything else (offline logging, overlays, sharing, PR tracking, schedule) works today and must
keep working on web through the change.

---

## 2. The options compared

|                            | A. Port everything to React Native (Expo + react-native-web)                                                    | B. Monorepo: web / mobile / shared                 | C. Wrap the PWA with Capacitor                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Web app                    | Rewritten in RN primitives, served through react-native-web                                                     | Untouched; current Vite PWA keeps shipping         | Untouched                                             |
| Mobile app                 | Native iOS/Android from the same code                                                                           | New Expo app, native UI                            | Current web UI inside a native shell                  |
| Code reused                | `domain`, `catalog`, most of `data`                                                                             | `domain`, `catalog`, most of `data`                | 100%                                                  |
| Code thrown away           | All ~15,700 lines of Mantine UI and PWA shell                                                                   | None                                               | None                                                  |
| Code written               | One new UI (all screens, once)                                                                                  | One new UI (all screens, once)                     | Plugin glue: timer, notifications, haptics            |
| Rest timer / notifications | Native                                                                                                          | Native                                             | Native (background task + local notification plugins) |
| Drag and drop              | Native gesture handler on mobile; same on web, feels less web-like                                              | Native on mobile, dnd-kit stays on web             | Still dnd-kit in a WebView; no improvement            |
| Web performance            | Worse. react-native-web ships a large runtime; Mantine, CSS modules, Workbox and the Lighthouse budgets go away | Same as today                                      | Same as today                                         |
| Look and feel              | One UI on both. Web looks like a mobile app                                                                     | Two UIs. Each matches its platform                 | One UI, web-styled                                    |
| Store presence             | Yes                                                                                                             | Yes                                                | Yes, but Apple can reject thin WebView apps           |
| Ongoing cost               | One codebase, one UI                                                                                            | Two UIs to keep in step; shared logic changes once | Lowest                                                |
| Rough effort               | Largest: rebuild web and mobile at once                                                                         | Large: build mobile only                           | Smallest: days to a couple of weeks                   |

Option A does not save the UI work. Mantine has no React Native version, so every screen is
rewritten either way. Option A also makes you rewrite and re-tune the web app you already have, and
accept a slower one.

Option C solves timer, clock and notifications but not drag and drop, and adds an App Store review
risk. Rejected on 2026-09-22 in favor of going straight to B.

---

## 3. Recommendation (adopted)

Option B: a monorepo with `web`, `mobile` and shared packages. Keep the PWA as the web app. Build
the mobile app in Expo.

1. **The UI rewrite is the same size under A and B.** Option A adds a web rewrite and a slower web
   app on top. Speed is the stated top priority for this app.
2. **The shared code already exists.** The BUILD_PLAN ground rules kept `domain` pure and Firebase
   confined to `data`. Option B is mostly moving folders, not refactoring.
3. **Different UIs is a feature here.** A gym app on a phone wants big touch targets, swipe
   gestures, haptics and a lock-screen timer. A web app wants keyboard entry and dense tables for
   reviewing history.
4. **Nothing breaks while you build.** Web keeps deploying from day one. The mobile app can ship at
   30% parity (log a workout, rest timer) and still be useful.

Two UIs cost something: every new feature needs two screens. Keep that cost down by putting all
logic, all state shape and all Firestore access in shared packages, so a screen is only layout plus
calls into shared hooks.

---

## 4. Target architecture

pnpm workspaces with pnpm's default isolated installs. They catch a screen that imports something
its package never declared, which is the main way two UIs drift. Expo has supported isolated
installs since SDK 54 and configures Metro for monorepos itself, so there is no
`node-linker=hoisted` (hoisting would switch that check off).

**One version of every shared dependency.** A pnpm catalog in `pnpm-workspace.yaml` holds the
version of anything more than one package uses (React, `@types/react*`, `@types/node`, Firebase,
TypeScript, Vitest). Each `package.json` says `"catalog:"`. Packages only one app uses (Mantine and
Vite for web, `expo-*` for mobile) stay in that app. Expo-managed packages follow
`npx expo install`.

React is pinned exactly, at the version the Expo SDK bundles: 19.3.0, from **Expo SDK 58**. Web's
`react-router` 8 needs ≥ 19.2.7, which rules out SDK 57's 19.2.3. React Native's renderer does not
enforce a React version at runtime, but SDK 58's pin is the tested pairing. Bump React only together
with the Expo SDK. Shared packages declare `react` as a peer; Vite also dedupes it as a guard.

```
lift-tracker/
  apps/
    web/          # current src/app + src/features + sw.ts, Vite, Mantine, Playwright
    mobile/       # Expo app: expo-router, RN screens
  packages/
    domain/       # src/domain as-is. Pure TS, no deps. Vitest
    catalog/      # src/catalog as-is. JSON + search index
    data/         # converters, hooks, mutations, sync. Firebase + React only
    ui-tokens/    # colors, spacing, type scale as plain TS, consumed by Mantine theme and RN styles
  rules/          # security-rules suite, its own workspace package
  firebase.json, firestore.rules, scripts/   # stay at the root
```

| Package         | Contents                                                                                        | Platform code allowed                                | Notes                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `domain`        | types, overlay, strength, volume, workoutDiff, sharing, schedule, history, export               | None                                                 | Moves unchanged. Keep the no-React, no-Firebase lint rule     |
| `catalog`       | generated JSON, `index.ts`, refinements                                                         | None                                                 | `scripts/build-catalog.ts` writes here                        |
| `data`          | converters, mutations, hooks, sync state, auth hook                                             | Firebase JS SDK, React                               | Firestore access stays confined here for both apps            |
| `data` adapters | `platform.ts` interface: `persistence`, `now()`, `scheduleAlarm()`, `cancelAlarm()`, `haptic()` | Web impl in `apps/web`, native impl in `apps/mobile` | Small. Only for things the browser and phone do differently   |
| `apps/web`      | everything under `src/app` and `src/features`, `sw.ts`, `index.html`, Vite config, e2e          | Web                                                  | Imports from `@lift/domain`, `@lift/data`. No behavior change |
| `apps/mobile`   | Expo screens, navigation, native timer, notifications, drag and drop                            | React Native                                         | Imports the same packages                                     |

Rules that keep the two UIs cheap:

- A screen never touches Firestore. It calls hooks from `@lift/data`.
- A screen never computes overlay, volume, PR or unit math. It calls `@lift/domain`.
- New feature work starts in `domain` and `data` with tests, then gets a web screen and a mobile
  screen.
- Shared hooks own `useRestCountdown`-style logic. The `platform` adapter owns how the deadline
  survives the app going to background.

**Firebase in React Native needs one decision.** The Firebase JS SDK runs in Expo, so `@lift/data`
reuses directly. But its Firestore offline cache on React Native is memory only, so queued writes
are lost if the OS kills the app mid-gym. `@react-native-firebase/firestore` uses the native SDKs
with full disk persistence, and its modular API now mirrors the JS SDK closely. Spike this in
Phase 0 before committing.

---

## 5. Phased build plan

Each phase leaves web deployable and `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
green at the root.

```mermaid
flowchart LR
  P0[Phase 0<br/>Spike] --> P1[Phase 1<br/>Workspaces]
  P1 --> P2[Phase 2<br/>Mobile shell]
  P2 --> P3[Phase 3<br/>Log + timer]
  P3 --> P4[Phase 4<br/>Editor + DnD]
  P4 --> P5[Phase 5<br/>Parity]
  P5 --> P6[Phase 6<br/>Release]
```

### Phase 0: Spike (1–2 evenings)

Prove the two unknowns before moving anything.

- [x] `npx create-expo-app` in a scratch folder. Copy `src/domain` in. Run its vitest suite under
      the RN TypeScript config. _Done 2026-09-28 in `C:\Git\lift-spike` (Expo SDK 57, RN 0.86).
      688/688 tests pass. Clean `tsc` with this repo's strict flags, and with no DOM lib. Both
      platforms bundle to Hermes bytecode._
- [x] Sign in with the existing Firebase project. Read one workout with the Firebase JS SDK. Repeat
      with `@react-native-firebase`. _Replaced by a type and bundle check: both SDKs compile and
      bundle for both platforms. The first real read happens in Phase 2._
- [x] Kill the app with a pending offline write. Relaunch. Check which SDK kept the write.
      _Decided from documentation (no iPhone available):_
  - The JS SDK's persistent cache needs IndexedDB. React Native has none, so the SDK logs "missing
    IndexedDB… Offline persistence has been disabled" and falls back to memory. The feature
    request is still open:
    [firebase-js-sdk#7947](https://github.com/firebase/firebase-js-sdk/issues/7947).
  - The native SDKs that `@react-native-firebase` wraps have "offline persistence enabled by
    default" on Android and Apple platforms
    ([Firebase docs](https://firebase.google.com/docs/firestore/manage-data/enable-offline)).
- [x] Schedule a local notification 90 s out, background the app, lock the phone. _iOS decided from
      documentation: a scheduled local notification is delivered by the OS, whether the app is
      suspended, killed or the phone is locked
      ([UNTimeIntervalNotificationTrigger](https://developer.apple.com/documentation/usernotifications/untimeintervalnotificationtrigger)).
      Android lateness is still worth one run on a real Android phone. It is a Phase 3 tuning
      question, not a blocker._

**Exit (met 2026-09-28):** `@react-native-firebase` on mobile. Background notifications: yes.

**Verify in the first TestFlight build (Phase 3):** kill the app mid-session with the network off,
relaunch online, and check that the sets arrive in Firestore. This is the check Phase 0 skipped
on iOS. If the sets do not arrive, stop and revisit the SDK choice before any more screens.

The spike app (`C:\Git\lift-spike`, runbook in its `SPIKE.md`) can still run the Android tests.

Found so far, and what each changes later:

- **Versions differ.** Expo 57 pins `react` 19.2.3. Web uses `^19.2.8`. Expo uses TypeScript
  6.0, web uses 5.9. _Resolved after Phase 1: everything moved to React 19.3.0 (Expo SDK 58) and
  TypeScript 6.0 (see "Dependency alignment" below)._
- **JS SDK auth typings.** `firebase/auth` puts a top-level `types` before `react-native` in its
  exports. TypeScript therefore never sees `getReactNativePersistence`. The fix is a `paths`
  entry that points at `@firebase/auth/dist/rn/index.rn.d.ts`. Needed only if mobile uses the JS
  SDK.
- **RNFB modular API matches the JS SDK.** `getFirestore`, `doc`, `setDoc`, `getDocs`,
  `getDocFromServer` and `disableNetwork` have the same names. Only the imports differ. So the
  `@lift/data` adapter can be an import alias, not a wrapper layer.
- **No Mac and no Android SDK on this machine.** Builds go through EAS (cloud). Android dev builds
  are free. A real-iPhone build needs a paid Apple Developer account. Phase 6 needs that account
  anyway.
- **Offline test uses `disableNetwork()`, not airplane mode.** A dev build loads its JS from Metro
  over wifi, so airplane mode would break the app, not only Firestore.

### Phase 1: Workspaces, no behavior change

_Done 2026-09-28, uncommitted._

- [x] Switch to pnpm: `pnpm-workspace.yaml`, delete `package-lock.json`. Create `apps/web`,
      `packages/domain`, `packages/catalog`, `packages/data`, `packages/ui-tokens`. _pnpm 11.27.1
      via `packageManager`. Isolated installs, not `node-linker=hoisted` (see §4). The lockfile was
      converted with `pnpm import`, so all 51 direct dependencies kept npm's exact versions.
      `rules/` became its own package (`@lift/rules`)._
- [x] `git mv` folders. Fix imports to `@lift/domain` etc. Keep `tsconfig` project references; each
      package gets its own `tsconfig.json` and `package.json` with `exports`. _Imports keep their
      old shape: `@/domain/x` → `@lift/domain/x`, `@/data/x` → `@lift/data/x`. Each package has a
      `tsconfig.lib.json` and a `tsconfig.test.json`._
- [x] Move Vite, PWA, Playwright, Lighthouse and bundle-size configs under `apps/web`. Root scripts
      delegate with `pnpm --filter @lift/web run <script>`. _`.env` files stay at the root
      (`envDir`)._
- [x] Move theme colors and spacing into `ui-tokens`; Mantine theme reads from it. _Accent ramps,
      presets, font, primary shades and compact button sizes. Sizes are unitless numbers._
- [x] Add a lint rule: `packages/domain`, `packages/catalog` and `packages/ui-tokens` may not import
      React, React Native, Firebase or `@mantine/*`. _Also: `packages/data` may not import Mantine,
      react-dom, react-router or dnd-kit._
- [x] Update `.github/workflows/*` paths. Firebase Hosting deploys `apps/web/dist`. _All five
      workflows use `pnpm/action-setup@v6` and `pnpm install --frozen-lockfile`._
- [x] ~~Pin web to Expo's React at the root.~~ Not with SDK 57: `react-router` 8 needs React ≥
      19.2.7 and SDK 57 pins 19.2.3. Solved the other way round below: both apps on SDK 58's React.
- [x] Make the catalog loader injectable. _`packages/catalog/src/source.ts` reads the JSON (web:
      `?url` + `fetch`). Phase 2 adds `source.native.ts`, which bundles the JSON._

Found on the way:

- `sw.ts` imported `workbox-core` without declaring it. npm's hoisting hid that; pnpm did not. Now
  declared.
- The seed script uses the Firebase client SDK, which is now a root dev dependency.
- pnpm refuses unreviewed install scripts. `pnpm-workspace.yaml` declines the same three that npm 11
  already skipped (`@firebase/util`, `protobufjs`, `re2`).
- Some script names (`deploy`, `update`) are also pnpm built-ins. Always write `pnpm run <script>`.

**Exit:** met locally, same feature set. Typecheck and lint clean. 862/862 unit tests (688 domain,
29 catalog, 16 data, 129 web). 52/52 rules tests. 85/85 e2e. The bundle-size report is identical
to the pre-move build, chunk for chunk, and so is the list of emitted assets. First CI run and
deploy still to watch.

### Dependency alignment (after Phase 1, 2026-09-28)

- [x] pnpm catalog for shared dependencies (§4).
- [x] React 19.3.0 and `react-dom` 19.3.0, exact. One React in the whole lockfile.
- [x] TypeScript 6.0.3, the newest typescript-eslint supports (`< 6.1`). The only fix needed was
      removing the deprecated `baseUrl` from three web tsconfigs. TypeScript 7 waits for
      typescript-eslint.
- [x] Everything else to latest: Mantine 9.6.3, `react-router` 8.4.0, Vite 8.3.1, Vitest 5.0.2,
      Firebase 12.19.0, jsdom 30, Playwright 1.63, ESLint 10.11, and patch releases.
- [x] Initial-JS budget raised from 150 to 155 kB. React 19.3.0's `react-dom` is 8.3 kB larger
      gzipped; all other upgrades together add 0.8 kB. Now 153.2 kB. Recorded in BUILD_PLAN §3.

### Phase 2: Mobile shell

- [ ] `apps/mobile` on **Expo SDK 58**, whose React (19.3.0) matches the catalog. `expo-router`,
      TypeScript strict, same ESLint base. SDK 58 was in preview on 2026-09-28. If it is still not
      stable, start on the preview and move to the release before any store build.
- [ ] Metro config for workspace packages. Confirm `@lift/domain` and `@lift/catalog` import and
      tree-shake, and that only one React ends up in the bundle.
- [ ] Put every Firebase import in `@lift/data` through one `sdk.ts` re-export file. Mobile adds
      `sdk.native.ts` that re-exports the same names from `@react-native-firebase/*`. Metro picks
      `.native.ts` automatically and Vite ignores it, so hooks and mutations stay shared. _Moved
      from Phase 1: it can only be typechecked once the RNFB packages are installed._
      `firebase.ts` and `firestore.ts` (web persistence setup) get `.native.ts` siblings the same
      way.
- [ ] `packages/catalog/src/source.native.ts`: the catalog JSON bundled into the app.
- [ ] Auth (sign in, email verification, sign out) using the `@lift/data` auth hook plus the Phase 0
      SDK choice. Google sign-in needs a native library; the web popup flow does not work in an
      app.
- [ ] After sign-in, prime the cache: open listeners on workouts, schedule, profile and recent
      sessions. Then the first gym visit with no signal still shows today's workout.
- [ ] EAS project, development build profile, and access to the friend's Apple and Play teams
      (App Manager or Admin in App Store Connect; user in Play Console).
- [ ] Read-only screens: Today, Workouts list, Workout detail. Bottom tabs matching `BottomNav.tsx`.
- [ ] Sync strip / offline indicator from `useSyncState`.

**Exit:** you can open the app at the gym and see today's workout offline.

### Phase 3: Logging, rest timer, notifications

The reason for the project.

- [ ] Active session screen: set grid, overlay numbers, RIR, unit toggle, all from shared hooks.
- [ ] Rest timer: shared `useRestCountdown` plus native `platform.scheduleAlarm`. Deadline stored as
      a timestamp, never a running interval.
- [ ] Local notification at deadline with Done action and repeat. Haptic and optional chime in the
      foreground. On iOS, set `interruptionLevel: 'timeSensitive'` (and enable the Time Sensitive
      Notifications capability) so a Focus mode does not hide the alert. The ring/silent switch
      still mutes sound, so rely on vibration and the banner.
- [ ] First TestFlight / Play internal build goes to beta users here. Run the kill-mid-session
      check from Phase 0 on an iPhone (a tester's is fine).
- [ ] Keep-awake toggle while a session is active.
- [ ] Bodyweight entry and PR flag on save.

**Exit:** full workout logged offline on a phone, timer fires with the screen locked, session syncs
when back online. Web unchanged.

### Phase 4: Workout editor and drag and drop

- [ ] Editor screen: slots, prescription editor, exercise picker with catalog search and recent
      searches.
- [ ] Reorder with `react-native-reanimated` + `react-native-gesture-handler` (via
      `react-native-draggable-flatlist` or `react-native-sortables`). Long-press to lift, haptic on
      pick and drop.
- [ ] Swipe to delete or duplicate, matching `SwipeRow` behavior.
- [ ] Version history view from `workoutDiff`.

**Exit:** create and edit a workout on the phone; web sees the new version.

### Phase 5: Parity

- [ ] History timeline, session detail, trend line, calendar.
- [ ] Sharing: universal links / app links so share URLs open the app; import and merge through the
      shared importer.
- [ ] Schedule, library browse, friends and QR, settings, export.
- [ ] Muscle map: port `bodyPolygons` to `react-native-svg`.

**Exit:** every scenario in `e2e/*.spec.ts` has a mobile equivalent (Maestro or Detox).

### Phase 6: Release

- [ ] EAS Build. TestFlight and Play internal testing.
- [ ] Store listing, privacy labels, account deletion flow (already exists in
      `mutations/account.ts`).
- [ ] Point phone visitors at the store with the OS mechanisms (Smart App Banner,
      `related_applications`, universal/app links). See §0.

---

## 6. How each missing feature gets built on mobile

| Feature                             | Web today                                                                | Mobile approach                                                                                                                                      | Shared piece                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Rest timer that survives background | `useRestCountdown` in the page, `sw.ts` holds the deadline as a fallback | Store `deadlineAt` (epoch ms) in session state. On resume, remaining = `deadlineAt - now()`. No interval runs in the background                      | `useRestCountdown` moves to `@lift/data`; only `now()` and `scheduleAlarm()` come from the platform adapter |
| Timer notification                  | Service worker, sticky, repeats twice at 25 s, Done action               | `expo-notifications` local notification scheduled at `deadlineAt`, with a Done action category and two follow-ups. Cancel all on Done or on next set | Same repeat policy, expressed in `domain` as a list of offsets                                              |
| Clock / elapsed session time        | `performedOn` plus render-time math                                      | Same math. Show elapsed in the header from `startedAt`. Optional iOS Live Activity later (third-party Expo module)                                   | `domain/sessions.ts` already has the timestamps                                                             |
| Foreground alert                    | Vibration API and `profile.restChime` tone                               | `expo-haptics` and `expo-av` (or `expo-audio`) using the same `restChime` profile flag                                                               | Profile field unchanged                                                                                     |
| Drag and drop                       | `@dnd-kit/sortable` in `SortableList.tsx`                                | `react-native-gesture-handler` + `react-native-reanimated` sortable list. Long-press lifts, auto-scroll near edges, haptic on lift and drop          | `domain/workouts.ts` reorder function takes `(slots, from, to)` and both UIs call it                        |
| Swipe row                           | `SwipeRow.tsx` with pointer events                                       | Gesture-handler `Swipeable`                                                                                                                          | Action list (delete, duplicate) defined once                                                                |
| Keep screen on                      | Wake Lock API, limited support                                           | `expo-keep-awake` while a session is active                                                                                                          | Setting flag in profile                                                                                     |

Permission timing stays as the web app does it: ask for notifications the first time a rest starts,
never at first launch.

---

## 7. Risks

| Risk                                              | Impact                                          | Mitigation                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase JS SDK has no disk cache on React Native | An offline workout is lost if iOS kills the app | Phase 0 spike. If confirmed, use `@react-native-firebase` on mobile behind the `@lift/data` adapter, or persist the active session yourself in `expo-sqlite` / MMKV until it syncs |
| Two UIs drift                                     | A feature ships on web and not on mobile        | Feature work starts in shared packages. Keep one parity checklist in this doc                                                                                                      |
| Metro and workspace packages                      | Duplicate React copies, slow resolution         | One React version in the catalog, matched to the Expo SDK; React as a peer in shared packages; Expo monorepo guide; test in Phase 2 before writing screens                         |
| Mantine theme and RN styles diverge               | Apps look unrelated                             | `ui-tokens` package is the only source of colors, spacing and type scale                                                                                                           |
| Web bundle grows from shared package boundaries   | Lighthouse and `check-bundle-size` fail         | Packages export ESM with `sideEffects: false`; run the size gate in Phase 1 before merging                                                                                         |
| Playwright e2e covers web only                    | Mobile regressions go unnoticed                 | Maestro flows for the Phase 3 logging path first; grow with each phase                                                                                                             |
