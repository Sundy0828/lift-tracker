/**
 * Marks an account's email as confirmed, without an email.
 *
 *   npm run verify-user -- --email someone@example.com
 *   npm run verify-user -- --all-unverified          # every password account
 *
 * This exists because gating the app on a confirmed address is retroactive:
 * accounts that existed before the gate have `emailVerified: false` and are
 * shut out of their own data until something sets it. Nothing a signed-in user
 * can do will set it — that is rather the point of verification — so it takes
 * the Admin SDK, the same service-account key `prune-users` needs:
 *
 *   Firebase console → Project settings → Service accounts → Generate key
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/outside/this/repo/key.json
 *
 * For a seeded or demo account whose address has no real mailbox, this is the
 * only way in. For a real person, prefer the confirmation email: it is the
 * check that the address actually reaches them, which is what makes password
 * reset work later.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? '';
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);

/**
 * A key as it comes out of the console, which is snake_case, alongside the
 * camelCase `ServiceAccount` the SDK's types describe. `cert()` accepts either
 * spelling; this file has to read the project id itself, so it accepts both
 * too — reading only `projectId` made the safety check below fire on every
 * real key, which is the worst way for a guard to fail.
 */
type KeyFile = ServiceAccount & { project_id?: string };

function loadCredentials(): KeyFile {
  const path = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  if (path === undefined || path === '') {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at a service-account JSON key ' +
        '(Firebase console → Project settings → Service accounts → Generate new private key).',
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as KeyFile;
}

/** The project a key belongs to, whichever spelling it uses. */
function projectOf(key: KeyFile): string | null {
  return key.projectId ?? key.project_id ?? null;
}

/** The project the app itself points at, so this can refuse to stray. */
function appProjectId(): string | null {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
      const match = /^VITE_FIREBASE_PROJECT_ID=(.+)$/m.exec(raw);
      const value = match?.[1]?.trim();
      if (value !== undefined && value !== '') return value;
    } catch {
      continue;
    }
  }
  return null;
}

async function listAll(auth: ReturnType<typeof getAuth>): Promise<UserRecord[]> {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken !== undefined);

  return users;
}

/** Google accounts arrive verified; only password sign-ins can be stuck. */
function isPasswordAccount(user: UserRecord): boolean {
  return user.providerData.some((entry) => entry.providerId === 'password');
}

async function main(): Promise<void> {
  const email = flag('email');
  const all = has('all-unverified');

  if ((email === null || email === '') && !all) {
    throw new Error('Pass --email <address>, or --all-unverified to fix every password account.');
  }

  const credentials = loadCredentials();
  const app = initializeApp({ credential: cert(credentials) });
  const auth = getAuth(app);

  const expected = appProjectId();
  const actual = projectOf(credentials);
  if (actual === null) {
    throw new Error('That key file has no project id in it. Is it a service-account key?');
  }
  if (expected !== null && actual !== expected) {
    throw new Error(`The key is for "${actual}" but the app points at "${expected}".`);
  }

  const targets =
    email !== null && email !== ''
      ? [await auth.getUserByEmail(email)]
      : (await listAll(auth)).filter((user) => isPasswordAccount(user) && !user.emailVerified);

  if (targets.length === 0) {
    console.log('Nothing to do: no unconfirmed password accounts.');
    return;
  }

  for (const user of targets) {
    if (user.emailVerified) {
      console.log(`  ${user.email ?? user.uid} was already confirmed`);
      continue;
    }
    await auth.updateUser(user.uid, { emailVerified: true });
    console.log(`  confirmed ${user.email ?? user.uid}`);
  }

  console.log(`\nDone. ${String(targets.length)} account(s) checked on ${actual}.`);
}

main().then(
  () => {
    process.exit(0);
  },
  (cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exit(1);
  },
);
