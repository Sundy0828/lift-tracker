# Lift Tracker — Idea Backlog

Things worth building **if** users ask for them. Nothing here is committed, ordered by priority, or
scheduled. Each entry says what it is, what it touches, and the one part that is harder than it
looks.

The app today is deliberately small: one account, reusable workouts, set-by-set history with
overlays, and link sharing. Every idea below adds surface area to that. The value of this list is
partly in what it stops you from starting by accident.

---

## 1. Scheduling

### 1.1 Weekly schedule ("PUSH on Mon/Wed/Fri")

Say which workouts belong to which days, and have Today tell you what today is instead of listing
everything you own.

- **Touches:** a new `schedules` collection under `users/{uid}`, Today's start list, and probably a
  new nav destination.
- **The hard part:** [BUILD_PLAN.md](BUILD_PLAN.md) §0 rejected a plan container _containing_ workouts, because two
  copies of ABS accumulated two divergent histories. A schedule must therefore hold **references**
  to workout ids and never own workout content. Get that wrong and you re-import the exact problem
  the current data model was chosen to avoid.
- **Cheap first version:** an ordered list of `{ dayOfWeek, workoutId }` rows, and Today filters its
  existing list by today's day with a "show everything" toggle. No streaks, no compliance
  percentage, no rest-day modelling.
- **Watch out for:** a schedule creates the concept of a _missed_ workout, and therefore of guilt.
  Decide deliberately whether the app judges you.

### 1.2 Deload / progression cycles

Week-over-week set or weight targets rather than one fixed prescription per workout.

- **Touches:** the prescription model, the overlay, the set grid.
- **The hard part:** prescriptions are versioned and sessions snapshot them. A cycle makes the
  prescription a function of time, which the version snapshot cannot express today.
- **Do this only if** users are editing the same workout every week to bump numbers by hand.

---

## 2. Notifications

Weekly-schedule reminders, "you have not logged in nine days", and a rest-timer notification that
survives a backgrounded tab.

- **Touches:** the service worker (`src/sw.ts`), a permission prompt somewhere calm in Settings, and
  Firebase Cloud Messaging plus a scheduled Cloud Function for anything server-driven.
- **The hard part:** three separate mechanisms wear one word. The rest timer is a **local**
  notification and needs no server. Inactivity nudges and schedule reminders need a server that
  knows the time in _your_ timezone and your last session date. iOS only delivers web push to an
  **installed** PWA, so a large share of users get nothing until they install.
- **Cheap first version:** the rest-timer notification only, local, no FCM, no functions, no
  backend cost. It is also the one users will actually thank you for mid-set.
- **Watch out for:** notification permission asked at the wrong moment is denied permanently. Ask
  after the first completed session, never on first paint.

---

## 3. Global workout library

Publish a workout for everyone; a moderator reviews it; other users browse and import it.

- **Touches:** a new top-level collection, Firestore rules (public read, restricted write), a review
  queue, and an import path — the import machinery already exists for share links and needs almost
  no change.
- **The hard part:** moderation is a product, not a checkbox. Someone has to read every submission,
  and "reviewed by an admin" needs an admin surface, a rejection reason, and a way to take a
  published workout down after the fact. Budget for the queue, not the feature.
- **Seed it first.** An empty library reads as an abandoned app. Write 15–30 credible workouts
  yourself (push/pull/legs, upper/lower, full-body 3-day, dumbbell-only, hotel-gym, 20-minute) and
  ship the library populated. This also lets you launch the browse-and-import half **without** the
  submission and review half — which is most of the value for a fraction of the work.
- **Watch out for:** copied copyrighted programs. A user submitting a well-known paid program is a
  takedown request waiting to happen. State the rule in the submission form.

---

## 4. Social

### 4.1 Friend codes

A short code you hand someone to connect, then share workouts without a link and see each other's
progress.

- **Touches:** a public-ish `users` index for code lookup, a `friends` subcollection, and Firestore
  rules that let a friend read a _narrow_ projection of your data and nothing else.
- **The hard part:** the rules. Every rule today keys on `request.auth.uid == uid`, which is what
  makes them short and auditable. Friend reads break that single check, and the rules file becomes
  the highest-risk file in the repo. Model exactly what a friend may read — records? volume? whole
  sessions? — before writing a line of it, and add rules tests for the negative cases.
- **Cheap first version:** friend codes that only make sharing easier (send a workout directly
  instead of copying a link). No progress visibility at all. Almost none of the rules risk.

### 4.2 Progress feed

Post a session, a PR, or a note; friends see it.

- **Touches:** a feed collection, a composer, images, moderation, and reporting.
- **The hard part:** it makes the app a social network, with everything that implies — abuse
  reports, blocking, deletion of other people's copies of your content, and a feed-ranking question
  that has no good small answer. Also: a feed with three friends in it is worse than no feed.
- **Do this only after** friends exist and are actually used.

---

## 5. Personalization

- **Themes** — the theme is already one `MantineColorsTuple` in `src/app/theme.ts`, so a handful of
  presets is genuinely cheap. A full custom colour picker is not: `autoContrast` and the dark scheme
  have to keep working at every shade, and a user-chosen colour can fail contrast.
- **Profile pictures** — needs Firebase Storage (a new service, new rules, new cost) plus image
  resizing and a moderation story for what people upload. Cheap alternative: generated initials or a
  chosen glyph, no upload, no storage.
- **Units, plate maths, rounding increments** — smaller than either of the above and more likely to
  be asked for.

---

## 6. Internationalization

- **Touches:** every string in `src/`, plus number and date formatting (`dayjs` is already a
  dependency and has locales).
- **The hard part:** the bundled exercise catalog is English — 800+ names, muscle groups, and
  instruction text. Translating the UI while every exercise stays in English is a half-finished
  feeling, and translating the catalog is a data project, not a code project.
- **Do this only with** a concrete audience. Until then, keep the copy translation-ready: short
  sentences, no idioms, no strings assembled from fragments.

---

## 7. Data collection

The user's framing was "phone numbers, and any other data I could use to get people more active".

- **Phone numbers** buy you exactly one thing the app cannot already do: SMS. Web push covers
  reminders for installed PWAs at no marginal cost, and SMS costs money per message. Collect a phone
  number when you have a message worth sending it, not before.
- **What actually drives activity, cheapest first:** the streak or "last trained" line the app can
  compute from existing session data; a personal-record notice at the end of a session; a weekly
  recap; then reminders. All of it from data you already store.
- **The hard part:** a phone number is personal data. Collecting it pulls in a privacy policy, a
  lawful basis for processing, deletion on account deletion (`src/data/mutations/account.ts` already
  handles deletion — it would need to cover this), and, if you ever text marketing, consent records.
  Do not collect it "in case it is useful later".

---

## 8. Analytics

- **Touches:** one SDK, one consent gate, and the §3 performance budget.
- **The hard part:** GA4's tag is heavy enough to matter against a 150 kB initial-JS budget that CI
  enforces. Load it lazily and after first interaction, the way `@mantine/notifications` already is
  in `src/app/providers.tsx`, or use a lighter product-analytics option.
- **Also:** consent. An analytics tag that fires before consent is a compliance problem in the EU
  and UK, and a cookie banner is a real cost to a clean app.
- **Cheap first version:** decide the five questions you would act on (do people finish sessions? do
  they use overlays? does sharing get used? which screen is abandoned?) and instrument only those.
  An analytics install with no question behind it produces dashboards nobody opens.

---

## 9. Platform and distribution

### 9.1 A real domain

The current URL is the free Firebase Hosting one.

- **Cost:** a domain plus a DNS record. Firebase Hosting attaches a custom domain and provisions the
  certificate.
- **Do not forget:** the Auth **authorized domains** list and `VITE_FIREBASE_AUTH_DOMAIN`, or Google
  sign-in and the email-verification links break on the new host. Share links already in the wild
  keep pointing at the old domain, so keep it serving.
- **This is the smallest item on this list and the one most visible to a new user.**

### 9.2 Watch and platform sync

Apple Health, Google Fit, Strava, Garmin, a watch app.

- **The hard part:** there is no shared standard. Each target is its own OAuth flow, its own data
  model, its own review process, and its own breakage. A watch app is a **native** app — a second
  codebase, an app store account, and a release process — and a PWA cannot reach watchOS.
- **Cheap first version:** an export. A CSV or JSON download of sessions gets the data out for
  anyone who asks, works today, and needs no partner. Then a Health/Fit _write_ of session duration
  and volume if the platform allows it from the web (largely it does not).
- **Do this last.** It is the highest effort-to-user ratio on the page.

---

## 10. Monetization

Unobtrusive ads, with a paid ad-free tier.

- **Touches:** an ad SDK, a payment provider (Stripe or the app stores), an entitlement stored per
  account and enforced in rules, and a receipt/refund path.
- **The hard part, in order:**
  1. **Ads are the opposite of this app's current feel.** It has a splash screen tuned to a paint
     budget and a CI-enforced bundle size. An ad SDK is heavier than the entire initial bundle and
     will fail those budgets.
  2. An ad on the logging screen is an ad in front of someone mid-set. If ads ever ship, they belong
     on History or Settings, never on the set grid.
  3. Payments make you responsible for tax, refunds, and a support inbox.
- **Consider instead:** a paid tier that unlocks features (global library submissions, extended
  history, export, themes) with **no ads at all**. Same revenue mechanism, none of the SDK weight,
  none of the trust cost.
- **Realistically:** monetize when hosting costs money and users are asking to pay. Firebase's free
  tier covers a surprising amount of a single-user-per-account app.

---

## 11. Sharing hardening

Not features — soft spots in the sharing code. Neither leaks data, and neither matters at one user.
Both matter the day the app has strangers on it. The second one is now closed.

### 11.1 A per-account cap on published shares

`firestore.rules` allows `create` on `sharedWorkouts` to any signed-in account with no limit, so one
account can mint unlimited public documents. That is an abuse and a billing surface, not a
correctness bug.

- **Rules alone cannot do this.** They cannot count documents, so a cap needs a counter they can
  read. The obvious place — a `shareCount` on `users/{uid}` — is owned by the account it limits,
  and the owner's own write rule lets them set it back to zero. Locking that one field down does
  not help either: a cap that decrements on revoke has to trust a second write in the same batch,
  and rules see one document at a time.
- **Two options that do work:**
  - **A Cloud Function.** Shares get created server-side (or a trigger counts them and disables
    the account's create rule via a custom claim). This is the only version a hostile client
    cannot beat, and it means a functions deployment and a cold-start on Share.
  - **A client-side soft cap.** The owner's inventory query already exists (`allow list` is scoped
    to `ownerUid`), so the client can refuse to publish past N and offer to revoke an old one. It
    stops accidents, not attackers.
- **Do this when** the app has users who are not you, or before any public launch. Take the soft
  cap first; it is an afternoon and it covers the real case.

### 11.2 A live share is frozen — done

`update` on `sharedWorkouts/{shareId}` now accepts one affected key, `revoked`, and only from the
owner. Everything else is fixed at create, so the snapshot a recipient reads through
`src/data/hooks/useSharedWorkout.ts` cannot move under them.

- `setShareRevoked` writes the flag on its own; it no longer stamps `updatedAt`, which the tightened
  rule would have refused and nothing read.
- Covered by the rules tests in `rules/firestore.test.ts`: revoking passes, a body rewrite fails,
  and `ownerUid` cannot move.

---

## Rough effort map

| Idea                          | Effort | Risk                     |
| ----------------------------- | ------ | ------------------------ |
| Real domain                   | S      | Auth domain list         |
| Rest-timer notification       | S      | none                     |
| Theme presets                 | S      | contrast at some shades  |
| CSV/JSON export               | S      | none                     |
| Per-account share cap         | M      | no rules-only version    |
| Weekly schedule (references)  | M      | re-nesting workouts      |
| Global library (seeded, read) | M      | none until submissions   |
| Analytics                     | M      | perf budget, consent     |
| Friend codes (sharing only)   | M      | Firestore rules          |
| Push notifications (server)   | L      | FCM, functions, iOS gaps |
| i18n                          | L      | the English catalog      |
| Profile pictures              | L      | Storage, moderation      |
| Progress feed                 | XL     | moderation, abuse        |
| Payments / ads                | XL     | perf, tax, trust         |
| Watch / platform sync         | XL     | native, per-partner      |
