# Lift Tracker — Idea Backlog

Things worth building **if** users ask for them. Nothing here is committed, ordered by priority, or
scheduled. Each entry says what it is, what it touches, and the one part that is harder than it
looks.

The app today is deliberately small: one account, reusable workouts, set-by-set history with
overlays, and link sharing. Every idea below adds surface area to that. The value of this list is
partly in what it stops you from starting by accident.

Entries marked **done** have shipped. They are kept rather than deleted, because the hard part each
one names is still the thing that will bite the next change to it.

---

## 1. Scheduling

### 1.1 Weekly schedule ("PUSH on Mon/Wed/Fri") — done

`users/{uid}/schedule/weekly` holds `{ dayOfWeek, workoutId }` rows and nothing else. `/schedule`
edits the week, and Today lists what the day is for with a "show everything" toggle
(`profile.scheduleFilter`).

- **References only**, as [BUILD_PLAN.md](BUILD_PLAN.md) §0 requires: the document holds workout ids,
  so renaming or editing a workout needs no schedule write, and two copies of ABS cannot accumulate
  two histories. Rows are pruned against live workouts at read time as well as on archive, because a
  workout can go on another device.
- **The app does not judge you.** There is no compliance figure, no missed-day marker and no
  rest-day modelling. The week streak on History follows the same rule: a week still running is
  never counted against you.
- **Still open:** nothing here knows about a workout you did on the wrong day, and that is
  deliberate — `performedOn` already files it correctly.

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
- **Done: the rest-timer notification**, local, no FCM, no functions, no backend cost. The worker
  holds the deadline (`src/sw.ts`), the notification is sticky (`requireInteraction`) with a Done
  action, and it repeats twice at 25-second intervals before giving up. The page raises its own
  alert as well — a vibration and an optional tone (`profile.restChime`) — because a foreground tab
  suppresses the notification, and the phone is more often face-up on a bench than in a pocket.
- **Still open:** everything server-driven. Inactivity nudges and schedule reminders need FCM, a
  scheduled Cloud Function, and a timezone per account.
- **Watch out for:** notification permission asked at the wrong moment is denied permanently. It is
  requested lazily, the first time a rest actually starts, and never on first paint.

---

## 3. Global workout library — browse half done

**Shipped: the seeded, read-only half.** `library/{id}` is world-readable and refuses every client
write; `scripts/seed-library.ts` fills it through the Admin SDK with twenty workouts built from
bundled catalog ids. `/library` browses and filters them, and taking a copy runs the **share
importer unchanged** — a library entry converts to the payload that path already takes, so it
inherits the fresh workout id, the clean overlay history and the merge option.

The submission and review half below is untouched, and is still the expensive part.

- **Touches:** a new top-level collection, Firestore rules (public read, restricted write), a review
  queue, and an import path — the import machinery already exists for share links and needs almost
  no change.
- **The hard part:** moderation is a product, not a checkbox. Someone has to read every submission,
  and "reviewed by an admin" needs an admin surface, a rejection reason, and a way to take a
  published workout down after the fact. Budget for the queue, not the feature.
- **Seeded first**, which is what let the browse-and-import half ship without the review queue.
  `scripts/library-seed.ts` holds the content; the seeder refuses to write anything the client's own
  parser would then refuse to read.
- **Watch out for:** copied copyrighted programs. The seed is deliberately generic templates rather
  than any named program. A user submitting a well-known paid program is a takedown request waiting
  to happen — state the rule in the submission form, if one is ever built.

---

## 4. Social

### 4.1 Friend codes — sharing half done

**Shipped: the sharing-only version, with no progress visibility at all.** `friendCodes/{code}` is a
public row holding a uid and a chosen name and nothing else; it is fetchable one code at a time and
never listable. A code is minted the first time an account is seen and **never changes** — it is an
address, printed on a QR and written in somebody's notes, so one that could change is one that stops
working for everyone who copied it.

**A connection takes both sides.** `friendEdges/{pairId}` is the request and the friendship in one
document, keyed by the two uids sorted — which is what stops a pair holding two mirror-image
requests: whoever asks second is refused by `create`, reads what is there, and accepts it. Accepting
is a status change on a document both sides can already read, so nothing ever writes into anybody
else's tree and `users/{uid}` keeps its single ownership rule.

A share can also name a recipient (`toUid`): you may list the shares addressed to you. That grants
nothing else — no records, no sessions, no volume — which is what kept the rules file short. Twenty
cases in `rules/firestore.test.ts` cover both collections, including the negative ones: a forged
sender, a third uid smuggled into the pair, the sender accepting their own request, and an accepted
connection being un-accepted.

The progress-visibility version below is untouched, and is still where the risk lives.

- **Touches:** a public-ish `users` index for code lookup, a `friends` subcollection, and Firestore
  rules that let a friend read a _narrow_ projection of your data and nothing else.
- **The hard part:** the rules. Every rule today keys on `request.auth.uid == uid`, which is what
  makes them short and auditable. Friend reads break that single check, and the rules file becomes
  the highest-risk file in the repo. Model exactly what a friend may read — records? volume? whole
  sessions? — before writing a line of it, and add rules tests for the negative cases.
- **Done, as above:** codes that only make sharing easier. Almost none of the rules risk, because
  there is no projection of your data for a friend to read.

### 4.2 Progress feed

Post a session, a PR, or a note; friends see it.

- **Touches:** a feed collection, a composer, images, moderation, and reporting.
- **The hard part:** it makes the app a social network, with everything that implies — abuse
  reports, blocking, deletion of other people's copies of your content, and a feed-ranking question
  that has no good small answer. Also: a feed with three friends in it is worse than no feed.
- **Do this only after** friends exist and are actually used.

---

## 5. Personalization

- **Themes — done.** Five presets in `src/app/theme.ts`, all registered under the one slot name
  `sky`, so the three dozen `--mantine-color-sky-*` references across the app follow the preset
  without being renamed. Kept in `localStorage` rather than the profile: the accent has to be right
  on the first paint, and the profile arrives over Firestore, which is not on that path (§3). A full
  custom colour picker is still not cheap — `autoContrast` and the dark scheme have to keep working
  at every shade, and a user-chosen colour can fail contrast.
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
- **Deliberately not started.** With one account and no domain there is nobody to measure, and the
  consent surface and the SDK weight are real costs paid up front. Revisit when there are users who
  are not you.

---

## 9. Platform and distribution

### 9.1 A real domain

The current URL is the free Firebase Hosting one.

- **Cost:** a domain plus a DNS record. Firebase Hosting attaches a custom domain and provisions the
  certificate.
- **Do not forget:** the Auth **authorized domains** list and `VITE_FIREBASE_AUTH_DOMAIN`, or Google
  sign-in and the email-verification links break on the new host. Share links already in the wild
  keep pointing at the old domain, so keep it serving.
- **This is the smallest item on this list and the one most visible to a new user.** Still not
  started — there is no domain yet.

### 9.2 Watch and platform sync

Apple Health, Google Fit, Strava, Garmin, a watch app.

- **The hard part:** there is no shared standard. Each target is its own OAuth flow, its own data
  model, its own review process, and its own breakage. A watch app is a **native** app — a second
  codebase, an app store account, and a release process — and a PWA cannot reach watchOS.
- **Export: done.** Settings writes both formats (`src/domain/export.ts`). CSV is one row per set,
  converted to the display unit so a column can actually be summed, with formula characters defused
  — a workout name beginning `=` is executed by every spreadsheet that opens the file. JSON is the
  session documents as stored, each weight in the unit it was entered in, wrapped in a
  `formatVersion` envelope so it could be read back.
- **The sync half is untouched.** A Health/Fit _write_ of session duration and volume needs a
  platform that allows it from the web, and largely none does.
- **Do the rest last.** It is the highest effort-to-user ratio on the page.

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

### 11.1 A per-account cap on published shares — soft cap done

**Shipped: the client-side soft cap**, twenty live shares per account, enforced where the owner's own
inventory query already runs (`MAX_LIVE_SHARES` in `src/domain/sharing.ts`). Past it the share panel
refuses to publish and offers to turn the oldest link off. A revoked share costs nothing and is not
counted.

It stops the accident and says so plainly in the UI. It does **not** stop a hostile client, and the
reasoning below is why no client-side version could.

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
- **Do the Cloud Function when** the app has users who are not you, or before any public launch.
  The soft cap covers the real case until then.

### 11.2 A live share is frozen — done

`update` on `sharedWorkouts/{shareId}` now accepts one affected key, `revoked`, and only from the
owner. Everything else is fixed at create, so the snapshot a recipient reads through
`src/data/hooks/useSharedWorkout.ts` cannot move under them.

- `setShareRevoked` writes the flag on its own; it no longer stamps `updatedAt`, which the tightened
  rule would have refused and nothing read.
- Covered by the rules tests in `rules/firestore.test.ts`: revoking passes, a body rewrite fails,
  and `ownerUid` cannot move.

---

## 12. Photos and video on a session

A picture on a session note — how you looked walking in, how you looked after — or a video of a
lift you are trying to max. Per session, and per exercise within it.

- **Touches:** a service the app does not use at all yet. Firebase Storage, its own `storage.rules`,
  an upload path, a viewer, and a deletion path in three places
  (`deleteSession`, `deleteAllData`, `deleteAccount`).
- **The hard part is not the upload.** It is that **Cloud Storage requires a Blaze billing
  account** — a new bucket cannot be created on Spark at all. So this feature is the moment the
  project stops being free, whatever the usage turns out to be. That is a decision about the
  project, not about the feature, and it is why nothing here is started.
- **Photos and video are not the same feature.** A photo compresses in the browser with a canvas
  to ~1600px JPEG, about 300 kB. A before/after pair on every session of a 5-day split is roughly
  150 MB a year — inside the 5 GB free allowance a Blaze project still gets. Video does not
  compress: browsers cannot re-encode reliably, so a 30-second 4K clip is uploaded at 100–200 MB.
  A few PR attempts a month is tens of gigabytes a year, plus egress every time it is watched.
- **Offline breaks the model.** Every other write in the app is queued by Firestore's own cache and
  flushes on reconnect (§2.8), which is why logging in a basement gym works. Storage uploads have
  no such queue: an upload started offline fails, and resuming it is code you have to write. The
  honest first version records the note immediately and marks the attachment as pending, which
  means a session document that references a file that may never arrive.
- **Cheap first version:** photos only, one per session note and one per exercise note, compressed
  client-side, with a hard refusal above ~2 MB after compression. No video, no gallery, no editing —
  and say plainly in the UI that a photo needs a connection.
- **Watch out for:** deletion. A file in Storage is not removed by deleting the Firestore document
  that points at it, so every path that deletes training data has to delete objects too, and a
  missed one leaves orphaned files nobody can see and everybody pays for.

---

## 13. Bodyweight, and the other graphs worth having

Every session already records a bodyweight — `SessionMeta` asks for it and nothing has ever read it
back. That is the cheapest graph in the app and the one nobody has drawn.

- **Touches:** a screen, and `TrendLine`, which already exists and already draws an exercise's
  estimated 1RM over time. The data is in the day index's sessions, or in the sessions themselves.
- **The hard part is the noise, not the plotting.** Bodyweight swings two or three pounds a day on
  water alone, so a line through raw daily readings tells you nothing. It needs a moving average —
  seven days is the usual answer — with the raw points behind it faint, or people read the wobble as
  progress and panic.
- **Also:** the entry has to get easier, or the graph stays empty. Today bodyweight is a field on a
  session, so a rest day records nothing and a week off records a gap. A plain "log today's weight"
  that writes a dated row, independent of a session, is probably the real feature.
- **Watch out for:** this is the one screen in the app that could make somebody feel worse. No goal
  weight, no red when it goes up, no streak. A line and a number.

**Other graphs, cheapest first:**

- **Volume per muscle over time** — the weekly muscle map already computes set-equivalents per
  muscle; plotting one muscle's weekly total answers "am I actually training legs" better than any
  single week can. Nearly free: the math is `domain/volume`, the shape is `TrendLine`.
- **Estimated 1RM per lift** — already drawn on the exercise history screen. What is missing is the
  comparison: three lifts on one chart, which is the powerlifting total you are chasing.
- **Sessions per week** — a bar per week. The calendar shows this as colour; a bar chart shows the
  trend, which is the thing that drifts without being noticed.
- **Rest taken vs prescribed** — now that rest is recorded per set, the gap between what a workout
  asked for and what you actually took is a real finding about your own training.
- **Time of day** — `startedAt` is already stored. A histogram says when you actually train, which
  is worth knowing before you schedule anything.

Do the bodyweight one first. It is the only one that needs data the app does not already read.

---

## 14. A training buddy that gets jacked with you

A figure beside the set grid that lifts when you lift, rests when you rest, and over months visibly
gains muscle — **only where you trained it**. Upper-body-only programming grows an upper body and
leaves the legs exactly as they were.

- **Touches:** the muscle map's existing artwork (`components/MuscleMap/bodyPolygons`), the weekly
  set-equivalent math it already runs on, and a new drawing that can be posed.
- **The good part is that the data is done.** `volume.ts` already answers "how many set-equivalents
  has this muscle had", per week and per muscle group, from sessions you actually logged. A
  per-muscle development score is a decayed running total of that and nothing more — which also
  makes it honest: it grows where you worked and fades where you stopped.
- **The hard part is the art, and it is genuinely hard.** A body that can be drawn at several stages
  of development _per muscle group_ is not one figure, it is a rig — a dozen regions each with three
  or four states, all of which have to join up without looking like a collage. That is an
  illustration project with an animation project inside it, and neither is code.
- **The second hard part is pacing.** Visible change has to be slow enough to mean something and
  fast enough to notice. Too fast and it is a toy; too slow and nobody ever sees a change and the
  whole thing is decoration.
- **Cheap first version:** no character and no animation. Take the muscle map that already exists
  and shade it by a decayed 12-week volume score instead of this week's, so the figure fills in over
  months. Same artwork, same math, none of the rig — and it answers the same question.
- **Watch out for:** a buddy that shrinks. Detraining is real and drawing it is honest, but an
  avatar that visibly wastes away while you are injured is the app kicking somebody who is already
  down. Fade towards neutral, never below where they started.

---

## 15. Runs from Strava

Bring runs in so the calendar and the week are the whole picture rather than the lifting half of it.

- **Touches:** an OAuth flow, a token store, a sync job, and a second kind of thing in `sessions` —
  which is the part that reaches furthest into the app.
- **The hard part is that a run is not a session.** Everything in this app is sets, reps and load:
  `sessionTotals`, the overlay, the muscle map, the records feed, the day index. A run has none of
  those and has distance, pace and heart rate instead. Bolting it into `Session` would put null
  checks through every one of them. A separate `activities` collection that the **calendar and the
  week totals** read, and that the overlay and records never see, keeps the lifting model intact.
- **The second hard part is OAuth without a server.** Strava's token exchange needs a client secret,
  which cannot live in a web client — so this needs a Cloud Function purely to hold it, plus refresh
  handling and a webhook if sync is to be automatic rather than a button.
- **Also:** Strava's API terms are specific about what may be stored, for how long, and how their
  data must be attributed. Read them before designing the sync, not after.
- **Cheap first version:** no OAuth at all. Strava exports a GPX or a bulk archive; a file import
  that reads date, duration and distance would fill the calendar for a fraction of the work, and
  would prove whether seeing runs there is actually worth the integration.
- **Do this after** the bodyweight graph. Both are "the app knows more about my week", and one of
  them needs no partner.

---

## Rough effort map

| Idea                          | Effort | Risk                     | State           |
| ----------------------------- | ------ | ------------------------ | --------------- |
| Rest-timer notification       | S      | none                     | done            |
| Theme presets                 | S      | contrast at some shades  | done            |
| CSV/JSON export               | S      | none                     | done            |
| Per-account share cap         | M      | no rules-only version    | soft cap done   |
| Weekly schedule (references)  | M      | re-nesting workouts      | done            |
| Global library (seeded, read) | M      | none until submissions   | done            |
| Friend codes (sharing only)   | M      | Firestore rules          | done            |
| Real domain                   | S      | Auth domain list         | not started     |
| Analytics                     | M      | perf budget, consent     | deliberately no |
| Push notifications (server)   | L      | FCM, functions, iOS gaps | not started     |
| i18n                          | L      | the English catalog      | not started     |
| Profile pictures              | L      | Storage, moderation      | not started     |
| Progress feed                 | XL     | moderation, abuse        | not started     |
| Payments / ads                | XL     | perf, tax, trust         | not started     |
| Watch / platform sync         | XL     | native, per-partner      | not started     |
| Photos on notes               | M      | needs Blaze, deletion    | blocked on cost |
| Video on notes                | L      | storage and egress cost  | blocked on cost |
| Bodyweight graph              | S      | noise, and the tone      | not started     |
| Volume-per-muscle graph       | S      | none                     | not started     |
| Buddy as a shaded body        | M      | pacing, detraining tone  | not started     |
| Buddy as a posed character    | XL     | it is an art project     | not started     |
| Runs from a Strava export     | M      | a run is not a session   | not started     |
| Runs over the Strava API      | L      | OAuth needs a server     | not started     |
