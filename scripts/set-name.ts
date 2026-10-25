/**
 * Sets an account's first and last name, for accounts made before sign-up
 * asked for one (the app would otherwise ask them on their next visit).
 *
 *   pnpm run set-name --email you@example.com --first Jerrod --last Sunderland           # dry run
 *   pnpm run set-name --email you@example.com --first Jerrod --last Sunderland --apply   # writes
 *
 * Writes only `firstName` and `lastName`, through the same rules the app uses
 * (`@lift/domain/person`). The friend-code name (`displayName`) is left alone:
 * it is separate on purpose, and may be a nickname.
 *
 * Admin SDK, like prune-users: GOOGLE_APPLICATION_CREDENTIALS points at a
 * service-account key kept outside the repo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { cleanName, nameProblem } from '@lift/domain/person';

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? '';
}

type KeyFile = ServiceAccount & { project_id?: string };

function loadCredentials(): KeyFile {
  const path = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  if (path === undefined || path === '') {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set. See scripts/prune-users.ts.');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as KeyFile;
}

/** The project the app points at, so this refuses to run against another. */
function appProjectId(): string | null {
  for (const name of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
      const value = /^VITE_FIREBASE_PROJECT_ID=(.+)$/m.exec(raw)?.[1]?.trim();
      if (value !== undefined && value !== '') return value;
    } catch {
      continue;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const email = flag('email');
  const first = flag('first') ?? '';
  const last = flag('last') ?? '';
  if (!email?.includes('@')) throw new Error('Pass --email with the account.');
  const problem = nameProblem(first, last);
  if (problem !== null) throw new Error(problem);

  const credentials = loadCredentials();
  const actual = credentials.projectId ?? credentials.project_id ?? null;
  const expected = appProjectId();
  if (actual === null) throw new Error('That key file has no project id in it.');
  if (expected !== null && actual !== expected) {
    throw new Error(`The key is for "${actual}" but the app points at "${expected}". Refusing.`);
  }

  const app = initializeApp({ credential: cert(credentials) });
  const user = await getAuth(app).getUserByEmail(email);
  const ref = getFirestore(app).collection('users').doc(user.uid);
  const before = (await ref.get()).data() ?? {};
  const name = { firstName: cleanName(first), lastName: cleanName(last) };

  const was = `${String(before['firstName'] ?? '')} ${String(before['lastName'] ?? '')}`.trim();
  console.log(
    `${email} (${user.uid}): "${was === '' ? '(none)' : was}" → "${name.firstName} ${name.lastName}"`,
  );

  if (!process.argv.includes('--apply')) {
    console.log('Dry run. Re-run with --apply.');
    return;
  }
  await ref.set(name, { merge: true });
  console.log('Saved.');
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
