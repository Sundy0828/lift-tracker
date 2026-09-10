# Email verification

Read this when someone says "I created an account and got no email".

## What the app sends

The app sends a **link**, not a code. There is nothing to type in.

`registerWithEmail` in `src/data/hooks/useAuth.tsx` calls `sendEmailVerification` from Firebase
Auth. Firebase emails a one-time link. The person clicks it, and Firebase marks the address
confirmed on its own servers. Nothing tells the app tab about it.

`VerifyEmailScreen` therefore asks. It calls `user.reload()` every 4 seconds while it is open, and
again when the person presses **I've confirmed it**. When the reload reports a confirmed address,
the gate in `src/app/RequireAuth.tsx` lets the person through.

If the first send fails, the screen says so and offers **Send it again**. The account is still
created. It is never left half-made.

## Who sends the mail

Firebase sends it from its default template, so the sender is
`noreply@lift-tracker-e4a9c.firebaseapp.com`.

Mail from a new project has no sending reputation. Providers often put it in spam, and some drop
it without a bounce. **Check the spam folder first.**

## Checklist for the Firebase console

No change to the app code can fix these. Check them in order.

1. **Template.** Authentication → Templates → "Email address verification". The template must
   exist and be enabled.
2. **Authorized domains.** Authentication → Settings → Authorized domains. The action-URL domain
   must be in the list. Firebase refuses the send with `auth/unauthorized-domain` if it is not.
3. **Quota and rate limits.** Identity Platform limits how many verification emails one address
   and one project can get. Over the limit, the send fails with `auth/too-many-requests`. Wait a
   few minutes. Repeated presses of **Send it again** make this worse.
4. **Mailbox.** A mistyped or nonexistent address bounces at the recipient's provider. Firebase
   reports success, and no one is told. Sign out and create the account again with the right
   address.

## The emulator sends no mail

This is the most likely cause.

`.env` sets `VITE_USE_FIREBASE_EMULATORS=true`, so a plain checkout runs against the local Auth
emulator. **The emulator sends no email at all.** It writes an out-of-band link to its own log
instead.

To find the link:

- Open the Emulator UI at `http://127.0.0.1:4000`, go to the Authentication tab, and read the
  out-of-band link for the account, or
- read the emulator's own log at `http://127.0.0.1:9099`, or
- fetch the codes directly:
  `curl http://127.0.0.1:9099/emulator/v1/projects/demo-lift-tracker/oobCodes`

The sign-in screen shows "Connected to the local Firebase emulators" when the app is in this mode.
If that line is on screen, no mail was ever sent.

A `.env.local` file, which is git-ignored, overrides `.env` in every mode. A local checkout with
`.env.local` present can point at the real project instead, in which case real mail is sent.

## Escape hatch: confirm an address by hand

`scripts/verify-user.ts` marks an account confirmed with the Admin SDK, with no email:

```
npm run verify-user -- --email someone@example.com
npm run verify-user -- --all-unverified
```

`--email` confirms one address. `--all-unverified` confirms every password account that is not yet
confirmed. Google accounts arrive confirmed, so the script skips them.

It needs a service-account key. Generate one in the Firebase console under Project settings →
Service accounts, save it outside this repo, and point the environment at it:

```
export GOOGLE_APPLICATION_CREDENTIALS=/path/outside/this/repo/key.json
```

The script reads the project id from `.env.local`, then `.env`, and refuses to run when the key
belongs to a different project.

Use this for a seeded or demo account whose address has no real mailbox. For a real person, prefer
the email: it is the only check that the address reaches them, which is what makes password reset
work later.
