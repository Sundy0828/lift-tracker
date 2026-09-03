# Lift Tracker — Build Plan

A phased implementation plan for a React + TypeScript PWA that tracks lifting plans,
workouts, and set-by-set history with previous-session overlays.

**How to use this document:** paste the "Ground Rules" section plus one Phase at a time
into Claude. Do not hand over the whole file and say "build this" — the phases are ordered
so each one leaves the app in a working, deployable state.

---

## 0. Product Summary

A single-user-per-account (with optional plan sharing) hypertrophy/strength log.

1. Build **exercises** — search a bundled public catalog or define custom ones with muscle groups.
2. Build **plans** — a plan contains named **workouts** (PUSH / PULL / CHEST+DELTS / ARMS+LEGS).
   Each workout contains ordered **exercise slots** with prescriptions: sets, a rep range,
   and a target RIR (reps in reserve) range.
3. **Log** a workout — pick a plan workout (or go ad-hoc), enter weight/reps/RIR per set, with
   last time's numbers overlaid inline on every set row so progression is obvious.
4. **Review** history — a date-ordered timeline of completed sessions. Each session is an
   immutable snapshot: opening an old session shows the plan _as it was then_, with the weights
   and reps actually performed.
5. **Share** a plan via link; import it as a new plan or merge it into an existing one.

### Confirmed decisions

| Decision            | Choice                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | React 19 + TypeScript, Vite                                                                                                         |
| UI kit              | **Mantine v7** — complete component set, CSS-Modules based, no runtime CSS-in-JS                                                    |
| Backend             | Firebase — Auth + Firestore + Hosting                                                                                               |
| Exercise data       | Bundled static catalog (free-exercise-db), not a runtime API                                                                        |
| Offline             | Full offline logging with background sync                                                                                           |
| Hosting             | Firebase Hosting                                                                                                                    |
| Scheduling          | **No repeating schedules.** Sessions are date-stamped automatically so history is always in correct time order; backdating allowed. |
| Day variants        | One workout per day type. Overlap between day types is expected and handled by the two-tier overlay (§2.6).                         |
| Units               | lb/kg toggle                                                                                                                        |
| Extras in scope     | Rest timer with notification; bodyweight logging; PR tracking                                                                       |
| Extras out of scope | Plate calculator; automatic weight suggestions                                                                                      |
| SEO                 | Out of scope. See Appendix B if a public landing page is added later.                                                               |

---

## 1. Ground Rules (paste this with every phase)

You are building a React 19 + TypeScript PWA called **lift-tracker**. Repo root is the
current directory.

- **TypeScript strict.** `strict: true`, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`. No `any`. No non-null `!` assertions — narrow properly.
- **No half-built features.** Every phase ends with the app building, typechecking, linting,
  and running. If a phase can't be finished, stop and say what's blocking; don't stub it out
  silently.
- **Run the gates before declaring a phase done:**
  `npm run typecheck && npm run lint && npm run test && npm run build`.
- **Performance is a stated requirement.** Respect the budgets in §3. Do not add a dependency
  over ~15 kB gzipped without stating what it costs and why nothing lighter works.
- **All domain logic lives in pure, unit-tested functions** under `src/domain/` with no React
  and no Firebase imports. Volume math, e1RM, overlay resolution, unit conversion, plan diffing,
  and PR detection are all pure functions over plain data. This is the layer to test hardest.
- **Firestore access is confined to `src/data/`.** Components never import `firebase/firestore`
  directly; they consume hooks from `src/data/hooks/`.
- **Every write must work offline.** Never block UI on a server round-trip, never `await` a
  write before showing the result, never read a document back to confirm a write succeeded.
- Commit at the end of each phase with a conventional-commit message.

### Target folder structure

```
src/
  app/            # routing, providers, theme, error boundaries
  domain/         # pure logic + types. no react, no firebase
    types.ts
    units.ts      # lb/kg conversion + display formatting
    volume.ts     # set-equivalents per muscle group
    strength.ts   # e1RM, RIR-adjusted comparison, PR detection
    overlay.ts    # two-tier previous-performance resolution
    planDiff.ts   # compare imported plan vs existing plan
  data/           # firebase: converters, hooks, mutations
    firebase.ts
    converters/
    hooks/
    mutations/
  features/
    exercises/
    plans/
    logging/
    history/
    sharing/
  components/     # shared presentational components
    MuscleMap/
  catalog/        # bundled exercise catalog + build script
```

---

## 2. Architecture

### 2.1 Stack

| Concern      | Choice                                                       | Why                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build        | Vite 6                                                       | fastest dev loop; good manual chunking control                                                                                                                                                                                                                 |
| UI kit       | **Mantine v7**                                               | as complete as MUI (NumberInput, RangeSlider, dnd, Drawer, Notifications) but styled with CSS Modules — no emotion, no per-render style serialization. Roughly half MUI's baseline and materially cheaper in the set-logging grid, with nothing to hand-build. |
| Router       | React Router v7 (data mode)                                  | needs lazy route-level code splitting                                                                                                                                                                                                                          |
| Server state | Firestore realtime listeners wrapped in custom hooks         | Firestore's listeners already cache, dedupe, and replay offline. **Do not** put TanStack Query in front of them — it duplicates the cache and fights offline persistence.                                                                                      |
| Client state | Zustand, for the active-session draft only                   | one small store; everything else is Firestore or URL state                                                                                                                                                                                                     |
| Forms        | React Hook Form, uncontrolled inputs                         | the set grid must not re-render on every keystroke                                                                                                                                                                                                             |
| PWA          | `vite-plugin-pwa` (Workbox, `injectManifest`)                | custom SW needed for catalog precaching + rest-timer notifications                                                                                                                                                                                             |
| Charts       | hand-rolled SVG, or `visx` primitives                        | the only chart is a small e1RM trend line; Recharts/Chart.js are far heavier than that needs                                                                                                                                                                   |
| Tests        | Vitest + Testing Library; Playwright e2e; Firestore emulator |                                                                                                                                                                                                                                                                |

Mantine specifics: import from `@mantine/core` (it ships proper ESM with no barrel problem),
add `@mantine/hooks`, `@mantine/notifications` (rest timer), and `@mantine/dates` (session
date picker). Set up the theme with `createTheme` and use `light-dark()` CSS or Mantine's
color-scheme manager so dark mode costs nothing at runtime.

### 2.2 Exercise catalog — bundle it, don't call an API

The plan uses **[free-exercise-db](https://github.com/yuhonas/free-exercise-db)**: ~800
exercises, Unlicense (public domain), with exactly the fields this app needs.

```ts
type CatalogExercise = {
  id: string;
  name: string;
  force: 'push' | 'pull' | 'static' | null;
  level: 'beginner' | 'intermediate' | 'expert';
  mechanic: 'compound' | 'isolation' | null;
  equipment: string | null;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  instructions: string[];
  category: string;
  images: string[];
};
```

**Vendor it at build time; do not fetch it at runtime.** A build script downloads
`dist/exercises.json`, splits `instructions` and `images` into a lazily-loaded side file, and
emits a compact search index (~200 kB gzipped for the searchable core, precached by the SW).

The main reason isn't offline — it's that search-as-you-type over a local index is instant and
a network round-trip per keystroke isn't, plus there's no API key, no CORS config, no rate
limit, and no third-party uptime dependency. Offline resilience is a free side effect that
happens to cover the one real offline case: adding an exercise mid-session at the gym.

Add `npm run catalog:update` to refresh it; commit the generated files.

> If live search over a larger set is wanted later, the **wger** API
> (`https://wger.de/api/v2/`) has public read endpoints needing no authentication, and can be
> layered in as an optional "search more exercises" path behind an online check. Treat it as an
> enhancement, never a dependency. No phase in this plan requires it.

**Custom exercises** live at `users/{uid}/customExercises/{id}` with the same shape plus
`isCustom: true`. The app resolves an exercise reference by checking custom exercises first,
then the bundled catalog, so one `Exercise` type flows through the UI.

### 2.3 Muscle group taxonomy

Use free-exercise-db's vocabulary verbatim so no mapping layer is needed:

```
abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes,
hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps
```

Define it as a `const` tuple and derive `type MuscleGroup = typeof MUSCLE_GROUPS[number]`.
Group into display regions (Chest, Back, Shoulders, Arms, Core, Legs) for UI grouping only.

### 2.4 Data model (Firestore)

All user data nests under `users/{uid}/` so security rules stay trivial and one listener tree
covers the app.

```
users/{uid}
  profile
    displayUnit: 'lb' | 'kg'
    defaultRestSeconds, createdAt

  customExercises/{exerciseId}
    name, primaryMuscles[], secondaryMuscles[], equipment, isCustom: true

  plans/{planId}
    name                           # "PPL + Upper"
    notes
    currentVersion: number
    workoutOrder: string[]         # workoutIds in display order
    archivedAt: Timestamp | null
    createdAt, updatedAt

  plans/{planId}/versions/{versionNumber}     # IMMUTABLE snapshots
    versionNumber: number
    createdAt
    changeSummary: string          # generated by planDiff
    workouts: PlanWorkout[]        # full denormalized snapshot

  sessions/{sessionId}
    planId: string | null          # null for fully ad-hoc
    planVersion: number | null     # which snapshot this was performed against
    workoutId: string | null       # STABLE across plan versions; null if ad-hoc
    workoutName: string            # denormalized: "CHEST + DELTS"
    status: 'active' | 'completed' | 'abandoned'
    performedOn: string            # 'YYYY-MM-DD' local date — the calendar key
    startedAt, completedAt
    entries: SessionEntry[]        # all logged sets, in this one document
    bodyweight: { value: number; unit: 'lb' | 'kg' } | null
    notes: string

  # --- DENORMALIZED OVERLAY INDEXES (see §2.6) ---

  workoutStats/{workoutId}         # TIER 1: last performance *within this workout*
    workoutId, workoutName
    lastSessionId, lastPerformedOn
    byOccurrence: {                # key: `${exerciseId}#${occurrenceIndex}`
      [key: string]: LastPerformance
    }

  exerciseStats/{exerciseId}       # TIER 2 + PRs: last performance anywhere
    lastSessionId, lastPerformedOn
    lastWorkoutId, lastWorkoutName # so the UI can label the fallback honestly
    lastSets: LoggedSet[]
    bestE1rm: number               # normalized unit
    bestE1rmAt, bestE1rmSessionId
    bestSet: LoggedSet             # the actual set that produced the PR
    totalSessions: number

sharedPlans/{shareId}              # top-level, public read
  ownerUid, ownerDisplayName
  plan: SharedPlanPayload          # self-contained snapshot + inlined custom exercises
  createdAt, revoked: boolean, importCount: number
```

Domain types:

```ts
type Weight = { value: number; unit: 'lb' | 'kg' }; // store as entered; convert at the edge

type Prescription = {
  sets: number; // 4
  repRange: { min: number; max: number }; // 12–20
  rirRange: { min: number; max: number }; // 1–3
  restSeconds: number | null;
  loadHint: string | null; // free text, e.g. "same as last + 5"
};

type PlanExerciseSlot = {
  slotId: string; // stable uuid, survives reordering
  exerciseId: string;
  exerciseName: string; // denormalized for offline/shared rendering
  occurrenceIndex: number; // 0, or 1+ if this exercise appears twice in the workout
  prescription: Prescription;
  supersetGroup: string | null;
  notes: string;
};

type PlanWorkout = {
  workoutId: string; // STABLE uuid across plan versions — overlay depends on this
  name: string; // "CHEST + DELTS"
  slots: PlanExerciseSlot[];
};

type LoggedSet = {
  setIndex: number;
  weight: Weight | null;
  reps: number | null;
  rir: number | null;
  isWarmup: boolean;
  skipped: boolean;
  completedAt: Timestamp | null;
};

type SessionEntry = {
  slotId: string | null; // null when added ad-hoc mid-session
  exerciseId: string;
  exerciseName: string;
  occurrenceIndex: number;
  prescription: Prescription | null;
  sets: LoggedSet[];
  notes: string;
};

type LastPerformance = {
  sessionId: string;
  performedOn: string;
  workoutId: string | null;
  workoutName: string;
  prescription: Prescription | null;
  sets: LoggedSet[];
};
```

### 2.5 Plan versioning — the core of the history requirement

The mechanism behind "modify plan A for week 2 and week 1 still reads correctly."

1. `plans/{planId}` holds the **editable working copy** plus a `currentVersion` pointer.
2. Editing mutates the working copy freely (drafts are cheap). On **publish** — or
   automatically the first time a session starts against a changed plan — write a new
   immutable `versions/{n}` snapshot and bump `currentVersion`.
3. A session records `planId` + `planVersion`. Rendering an old session reads that snapshot,
   never the live plan. Old sessions are therefore permanently correct.
4. `changeSummary` comes from `domain/planDiff.ts` so the version list is readable:
   _"Added Incline DB Press, removed Cable Fly, Bench Press 3→4 sets."_
5. **`workoutId` is stable across versions.** Renaming CHEST → CHEST + DELTS, reordering it, or
   changing its exercises keeps the same `workoutId`, which is what preserves that workout's
   overlay history. Only creating a genuinely new day type mints a new `workoutId`.

**Never** delete or rewrite a version document. Anything that would require it is a new version.

### 2.6 The previous-session overlay — two tiers

**The problem this solves.** With PUSH, PULL, CHEST+DELTS, and ARMS+LEGS, bench press appears
on more than one day. Bench on PUSH is done fresh; bench on CHEST+DELTS is done alongside
different surrounding work, at different loads. Overlaying "the last time you benched anywhere"
would compare PUSH-day bench against CHEST-day bench and produce a meaningless delta. So the
overlay resolves in two tiers:

**Tier 1 — same workout (primary).** Look up
`workoutStats/{workoutId}.byOccurrence[exerciseId#occurrenceIndex]`. This is the last time you
did _this lift on this day type_. It is the number shown prominently, labeled with the date:
_"Last CHEST + DELTS · Aug 26 — 185 × 9 @ 2 RIR"_. Deltas and progression are computed against
this and nothing else.

**Tier 2 — anywhere (secondary, clearly labeled).** If tier 1 misses — you just added bench to
CHEST day, or it's a brand-new workout — fall back to `exerciseStats/{exerciseId}`, shown in a
visually subordinate style and honestly labeled with where it came from:
_"No CHEST + DELTS history · last done on PUSH, Aug 24 — 205 × 6"_. It's a useful starting
reference for what weight to load, and it is explicitly **not** counted as a progression
comparison — no delta chip, no PR evaluation against it.

**Tier 3 — NEW.** Neither exists → the **NEW** badge. That's the whole new-exercise rule; no
separate bookkeeping.

Resolution lives in `domain/overlay.ts` as a pure function:

```ts
resolveOverlay(
  slot: PlanExerciseSlot,
  workoutStats: WorkoutStats | null,
  exerciseStats: ExerciseStats | null,
): { kind: 'same-workout'; data: LastPerformance }
 | { kind: 'other-workout'; data: LastPerformance }
 | { kind: 'new' }
```

Why this shape is fast:

- **Tier 1 is a single document read for the entire session.** `workoutStats/{workoutId}` holds
  every exercise in that workout in one doc, keyed by `exerciseId#occurrenceIndex`. Open a
  session, read one doc, the whole overlay is populated. (Well under the 1 MB doc limit — ~15
  exercises × a handful of sets each.)
- Tier 2 is one read per _unmatched_ exercise only, fetched in parallel and typically zero.
- No historical queries at log time. Rendering the overlay must never touch the network.
- The `#occurrenceIndex` suffix handles doing the same exercise twice in one workout
  (e.g. bench early and again as a back-off set) without the two collapsing into each other.

Writes on session completion, in one batch:

- Overwrite `workoutStats/{workoutId}` with this session's performances (skip entirely for
  ad-hoc sessions with no `workoutId`).
- Update `exerciseStats/{exerciseId}` for each exercise: overwrite `lastSets`/`lastWorkoutId`,
  and `max()` into `bestE1rm` / `bestSet` for PR tracking.

**Delta computation** (`domain/strength.ts`): compare on **estimated 1RM**, not raw weight, so
185×8 vs 195×5 resolves correctly. Epley (`w × (1 + reps/30)`), plus an RIR-adjusted variant
that adds RIR to reps before estimating — so a set taken closer to failure isn't scored as an
improvement over a heavier easy set. Normalize units before comparing. Per set row, show last
time's `weight × reps @ RIR` and a delta chip (`+5 lb`, `+2 reps`, `=`, `−`).

Deeper history (last 3–5 performances, e1RM sparkline) comes from querying `sessions` and is
loaded **lazily on tap** — never on the log screen's critical path. Give the per-exercise
history view a filter to scope it to one workout or show all days.

### 2.7 Units

- Every stored weight is `{ value, unit }` — recorded **as entered**. No lossy conversion on
  write, so switching the display unit never rewrites or degrades historical data.
- `domain/units.ts` normalizes to a single internal unit (kg) for all comparison, e1RM, and PR
  math, and formats to the user's `displayUnit` for rendering.
- Input steppers respect the display unit's natural increments (2.5 lb / 1.25 kg) and the unit
  is shown inline on any row whose stored unit differs from the current display preference.
- Unit conversion and rounding get dedicated unit tests, including round-tripping.

### 2.8 Offline-first strategy

```ts
initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

- Firestore's persistent cache is the sync queue: offline writes apply to the local cache
  immediately, the UI re-renders from cache, and they flush on reconnect. Build on this rather
  than writing a custom sync layer.
- **One session = one document.** All logged sets live in the session doc's `entries` array, so
  a whole offline workout is a small number of queued writes and the session stays atomically
  consistent. Debounce set writes ~500 ms and write the full `entries` array (single user,
  single device — no merge conflicts to design around).
- Surface sync state honestly from `snapshot.metadata.hasPendingWrites` / `fromCache`: a small
  "saved locally · will sync" chip. Never a spinner that blocks logging.
- Service worker precaches the app shell **and the exercise catalog**, so a cold offline start
  can still build and log a workout.
- **Verification is part of the phase:** a Playwright test that goes offline, logs a complete
  session, reloads while still offline, confirms the data survived, then reconnects and confirms
  it reaches the emulator.

### 2.9 Sharing

- Publishing writes `sharedPlans/{shareId}` with a **self-contained** payload: the plan version
  snapshot plus full definitions of any custom exercises it references (a recipient won't have
  them). Catalog exercises are referenced by id only.
- The share route is public-read, no auth needed to view.
- Import offers two paths:
  - **Import as new plan** — straight copy; custom exercises created under the importer's
    account, deduped by normalized name. New `workoutId`s are minted, so the importer's overlay
    history starts clean.
  - **Merge into existing plan** — `planDiff` preview (added / removed / changed prescriptions,
    per workout) with per-change checkboxes, then publish the result as a new version of the
    target plan. **Merging preserves existing `workoutId`s**, so overlay history survives the
    merge. Merging must never mutate an existing version.

---

## 3. Performance budgets and rules

Stated targets, enforced in CI:

| Metric                                      | Budget       |
| ------------------------------------------- | ------------ |
| Initial JS (gzipped, entry + shared chunks) | ≤ 150 kB     |
| Route chunks                                | ≤ 60 kB each |
| LCP on a throttled mid-tier mobile profile  | ≤ 2.0 s      |
| INP while typing in the set grid            | ≤ 100 ms     |
| Lighthouse PWA + Performance                | ≥ 95         |

Non-negotiable rules:

- Route-level `React.lazy` for every feature area. Plan editing, history, and sharing must not
  be in the entry bundle.
- Import only the Mantine packages actually used; don't pull `@mantine/charts` (it wraps
  Recharts) — the one trend line is hand-rolled SVG.
- The active-session screen is the hot path. Set inputs are **uncontrolled** (RHF), state
  commits on blur/step, and the muscle map and overlay rows are memoized. Typing a rep count
  must not re-render sibling set rows.
- Virtualize the exercise-search results list (`@tanstack/react-virtual`).
- Local exercise search is a prebuilt token index with `useDeferredValue` on the query. No
  fuzzy-search library unless a plain index measurably isn't good enough.
- `rollup-plugin-visualizer` in the repo; a bundle-size check wired into CI so a budget
  regression fails the build.

---

## 4. Phases

Each phase is a self-contained prompt. Do not start a phase until the previous one's
acceptance criteria pass.

### Phase 0 — Foundation

Scaffold Vite + React 19 + TS with the folder structure from §1. Configure strict TS, ESLint,
Prettier, Vitest, Playwright, and the four npm gates. Mantine theme with light/dark following
`prefers-color-scheme`, and a mobile-first layout shell with bottom navigation
(Today / Plans / History / Settings). Firebase init with Auth (Google + email) and Firestore
with persistent multi-tab cache. `vite-plugin-pwa` with `injectManifest`, a real manifest, and
maskable icons. Firebase emulator suite for local dev. Firebase Hosting deploy target.
Settings screen with the lb/kg toggle wired to `profile.displayUnit`, and `domain/units.ts`
with tests.

**Done when:** the app installs as a PWA on a phone, sign-in works against the emulator, an
authenticated route redirects when signed out, the unit toggle persists, and all four gates
pass. No features yet.

### Phase 1 — Exercise catalog + custom exercises

Build `scripts/build-catalog.ts`: fetch free-exercise-db, normalize to `CatalogExercise`, split
heavy fields into a lazy chunk, emit the search index. Implement exercise search (virtualized,
instant, filterable by muscle group and equipment) and custom-exercise CRUD (name, primary
muscles, secondary muscles, equipment). Implement the unified `Exercise` resolver that overlays
custom exercises on the catalog.

**Done when:** searching 800+ exercises is instant offline, a custom exercise can be created and
found in search alongside catalog results, and `domain/` has tests for the resolver and search
index.

### Phase 2 — Plans, prescriptions, and the muscle map

Plan CRUD: create a plan, add named workouts, add exercise slots with drag-reordering, set the
prescription per slot (sets count, rep range, RIR range, rest seconds, notes). Adding the same
exercise twice in one workout assigns `occurrenceIndex` correctly. Implement plan versioning per
§2.5 including `domain/planDiff.ts`, generated change summaries, stable `workoutId` handling,
and a version-history view.

Build `components/MuscleMap`: inline front/back body SVG with a `<path>` per muscle group, each
carrying `data-muscle`. Renders a heat map from `domain/volume.ts`, which computes
set-equivalents per muscle group (primary = 1.0 per set, secondary = 0.5) on a 5-stop scale.
Show it live while editing a workout ("what this session hits") and aggregated across the plan
("what this plan hits per week"), with a per-muscle set-count readout so imbalances are visible.
Accessible: the SVG is decorative, the numbers are the real content in a table.

**Done when:** a 4-day plan can be built end to end, editing it produces a new version with a
readable summary while keeping `workoutId`s stable, old versions are viewable and unchanged, and
the muscle map updates as exercises are added. `volume.ts` and `planDiff.ts` are unit-tested
including superset, duplicate-exercise, and multi-muscle cases.

### Phase 3 — Logging with the two-tier overlay

The active-session screen. Start a session from a plan workout or ad-hoc. Per exercise, render
prescribed set rows with weight / reps / RIR inputs, a per-set complete toggle, and the ability
to add or skip sets mid-session. Log bodyweight for the session.

Implement the overlay per §2.6: `domain/overlay.ts` resolving tier 1 (same workout, prominent,
with delta chips) → tier 2 (other workout, subordinate, labeled with its source day, **no**
delta) → NEW badge. Tier 1 is one `workoutStats` doc read, prefetched on session open. Session
completion writes the batched `workoutStats` + `exerciseStats` update, including PR detection
into `bestE1rm` / `bestSet`, with a PR toast when a set beats the record.

Rest timer: auto-starts on set completion using the slot's `restSeconds`, visible on screen, and
fires a notification via the service worker when it expires so it works with the screen off.
Request notification permission lazily, on first use, and degrade gracefully if denied.

`performedOn` is stamped from the local date automatically. Allow editing it (for a workout
logged the next morning) but never require it.

**Done when:** a full workout can be logged in under a minute of tapping; the second time the
same workout is logged every row shows that workout's own last numbers with correct deltas;
benching on CHEST+DELTS after having benched on PUSH shows the PUSH numbers as a labeled
secondary reference with no delta; a newly-added exercise shows NEW; the rest timer notifies
with the screen off. `overlay.ts` and `strength.ts` are unit-tested — the two-tier fallback, the
duplicate-occurrence case, RIR-adjusted comparison, PR detection, mixed units, and the
plan-changed-between-weeks case.

### Phase 4 — History and timeline

A date-ordered list/calendar of sessions keyed on `performedOn`, grouped by week with volume and
set totals. Session detail renders the session against its recorded `planVersion` snapshot — the
archaeology view. Per-exercise history: every performance of one lift over time with a
hand-rolled e1RM trend line and a PR list, loaded lazily, filterable to a single workout or all
days. A PR feed across all lifts.

**Done when:** week 1's session opens showing the week-1 plan definition and week-1 weights after
the plan has been edited twice; per-exercise history spans plan versions correctly; the
workout filter separates PUSH bench from CHEST-day bench.

### Phase 5 — Offline hardening and PWA polish

Sync-state UI (pending-writes chip, last-synced time). Verify the SW precaches the catalog. Add
the Playwright offline test from §2.8. Install prompt, app shortcut to "Start today's workout",
screen wake-lock during an active session, and a "discard or resume active session" path after a
crash or reload.

**Done when:** the offline Playwright test passes, and airplane mode on a real phone allows a
cold start, a full logged workout with a working rest timer, and a clean sync on reconnect.

### Phase 6 — Plan sharing and import

Publish a plan version to `sharedPlans` with inlined custom exercises. Public share route (no
auth to view, sign-in to import). Import-as-new (mints fresh `workoutId`s) and
merge-into-existing (preserves `workoutId`s) with the diff preview per §2.9. Firestore security
rules for public read + owner-only write, plus a revoke action.

**Done when:** a plan shared from one account imports into another that lacks the custom
exercises; merging into an existing plan produces a new version with a correct change summary
and the target's overlay history still resolves; rules tests confirm nobody can write another
user's data.

### Phase 7 — Performance pass

Measure against §3 with the bundle visualizer and Lighthouse on a throttled mobile profile. Fix
what's over budget. Wire bundle-size and Lighthouse checks into CI. Profile the set grid with
React DevTools and eliminate any render cascade on keystroke. Verify no render-blocking Firestore
read on first paint.

**Done when:** every budget in §3 is met and enforced in CI.

---

## Appendix A — Security rules sketch

```
match /users/{uid}/{document=**} {
  allow read, write: if request.auth.uid == uid;
}
match /sharedPlans/{shareId} {
  allow read: if resource.data.revoked == false;
  allow create: if request.auth.uid == request.resource.data.ownerUid;
  allow update, delete: if request.auth.uid == resource.data.ownerUid;
}
```

Write emulator rules tests for these in Phase 6 — treat them as code, not configuration.

## Appendix B — SEO, if a public landing page is added later

Deliberately out of scope: the app is entirely behind auth, so there is nothing to index and no
benefit to paying the complexity cost of SSR.

If a marketing surface is wanted later, the cheapest correct approach is a **separate
prerendered route set** — a static landing page plus the public share pages — rather than
converting the app to SSR. Public share pages are the one genuinely indexable surface: give them
real `<title>` / `<meta description>` / OG tags and consider prerendering just those routes.
Do not add Next.js to the app for this.
