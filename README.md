# lift-tracker

A React 19 + TypeScript PWA for planning, logging, and reviewing lifting sessions.
See [BUILD_PLAN.md](BUILD_PLAN.md) for the architecture and the phase plan.

**Status: phase 0 (foundation) complete.** Auth, offline Firestore, the unit
preference, routing, and the installable shell are in place. No lifting
features yet — those start in phase 1.

## Quick start

```bash
npm install
npm run emulators   # terminal 1 — needs Java, see below
npm run dev         # terminal 2 — http://localhost:5173
```

Sign in with any email and a 6-character password; the Auth emulator accepts
anything.

## Gates

All four must pass before a phase is considered done:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

| Script              | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server                                                      |
| `npm run typecheck` | `tsc --build` across the app, service worker, node, and e2e projects |
| `npm run lint`      | ESLint (type-aware, zero warnings allowed) + Prettier check          |
| `npm run test`      | Vitest unit tests                                                    |
| `npm run build`     | Production build, including the service worker and `dist/stats.html` |
| `npm run e2e`       | Playwright against a production build (needs the emulators up)       |
| `npm run emulators` | Firebase Auth + Firestore emulators                                  |
| `npm run icons`     | Regenerates `public/icons/*` from `scripts/generate-icons.ts`        |
| `npm run deploy`    | Build, then `firebase deploy --only hosting`                         |

## Firebase configuration

`.env` is committed and points at the emulator suite with a `demo-` project id,
so nothing here needs a real Firebase account.

To use a real Firebase project, `cp .env.example .env.local` and fill in the six
values from the console (Project settings > General > Your apps > SDK setup and
configuration). `.env.local` is git-ignored and overrides `.env` in every mode,
so it covers dev, build, and the e2e suite at once.

Three of these cannot be done from a config file:

1. **Authentication > Sign-in method** — enable **Email/Password** and
   **Google** (Google also wants a support email). `localhost` is an authorized
   domain by default, so the sign-in popup works in dev with no extra setup.
2. **Firestore Database > Create database** — pick a region. Production mode is
   fine; the rules below replace the defaults.
3. **Deploy the rules**, or every write is denied:

   ```bash
   npx firebase login
   npx firebase use --add          # select the project, alias it `default`
   npx firebase deploy --only firestore:rules
   ```

   Skipping this has a misleading symptom rather than an error: the unit toggle
   still works, because the write lands in the local cache, but the
   "saved locally · will sync" chip never clears.

### The Firestore emulator needs Java

`firebase emulators:start` runs the Auth emulator on Node, but the Firestore
emulator is a Java process. Without a JDK on `PATH` it fails with
`Could not spawn 'java -version'`. Install a JDK 17+ (for example
`winget install EclipseAdoptium.Temurin.21.JDK`) to get Firestore locally.

Without it, `npm run emulators -- --only auth` still works, and the app remains
usable: Firestore writes queue in the persistent local cache and the UI reads
back from it, which is the same path a real offline session takes. They just
never reach a server.

## Layering rules (enforced by ESLint)

- `src/domain/` is pure — no React, no Firebase. This is the layer to test hardest.
- `src/data/` is the only place that imports `firebase/firestore`. Components
  consume hooks from `src/data/hooks/`.
- `src/data/firebase.ts` (app + auth) is on the first-paint path and must never
  import `firebase/firestore`. The Firestore instance lives in
  `src/data/firestore.ts`, which is reachable only from lazy chunks — the SDK is
  ~149 kB gzipped, larger than the whole initial-JS budget.
