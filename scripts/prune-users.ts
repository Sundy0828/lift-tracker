/**
 * Deletes throwaway accounts and everything they own.
 *
 *   npm run prune-users                 # dry run: prints what it would delete
 *   npm run prune-users -- --delete     # actually does it
 *   npm run prune-users -- --domain lift-tracker.dev --delete
 *
 * **Dry run by default.** Nothing is removed unless `--delete` is passed, so
 * the safe thing is also the thing you get by typing less.
 *
 * Unlike every other script here this needs the **Admin SDK**: listing users
 * and deleting someone else's data are privileged operations that no signed-in
 * client can do, however legitimate. Point it at a service-account key:
 *
 *   Firebase console → Project settings → Service accounts → Generate key
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/outside/this/repo/key.json
 *
 * Keep that file out of the repo. It is a permanent, unscoped key to the whole
 * project — worth more than any password in it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? '';
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);

/**
 * The one collection an account's data lives under. Everything is nested here
 * so a delete is one recursive call rather than a list of collections to keep
 * in step with the schema.
 */
const USERS = 'users';

function loadCredentials(): ServiceAccount {
  const path = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  if (path === undefined || path === '') {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at a service-account JSON key ' +
        '(Firebase console → Project settings → Service accounts → Generate new private key).',
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
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

function providersOf(user: UserRecord): string {
  const ids = user.providerData.map((entry) => entry.providerId);
  return ids.length === 0 ? 'none' : ids.join(',');
}

/** How much is stored under one account, for the dry run's benefit. */
async function countDocuments(db: Firestore, uid: string): Promise<number> {
  const root = db.collection(USERS).doc(uid);
  let total = (await root.get()).exists ? 1 : 0;

  for (const collection of await root.listCollections()) {
    const documents = await collection.listDocuments();
    total += documents.length;
    for (const document of documents) {
      for (const nested of await document.listCollections()) {
        total += (await nested.listDocuments()).length;
      }
    }
  }
  return total;
}

async function main(): Promise<void> {
  const domain = (flag('domain') ?? 'example.com').toLowerCase().replace(/^@/, '');
  if (domain === '' || domain === '.' || !domain.includes('.')) {
    throw new Error(`Refusing to match on "${domain}" — that is not a domain.`);
  }

  const credentials = loadCredentials();
  const app = initializeApp({ credential: cert(credentials) });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const expected = appProjectId();
  const actual = credentials.projectId ?? '(unknown)';
  if (expected !== null && actual !== expected) {
    throw new Error(
      `The key is for "${actual}" but the app points at "${expected}". Refusing to run: ` +
        'deleting users out of the wrong project is not something to discover afterwards.',
    );
  }
  console.log(`Project ${actual}, matching addresses at @${domain}\n`);

  const all = await listAll(auth);
  const suffix = `@${domain}`;
  const matched = all.filter((user) => (user.email ?? '').toLowerCase().endsWith(suffix));

  if (matched.length === 0) {
    console.log(
      `No accounts at @${domain}. Nothing to do. (${String(all.length)} users in total.)`,
    );
    return;
  }

  console.log(
    `${has('delete') ? 'DELETING' : 'WOULD DELETE'} ${String(matched.length)} of ${String(all.length)} accounts:\n`,
  );
  for (const user of matched) {
    const documents = await countDocuments(db, user.uid);
    console.log(
      `  ${user.email ?? '(no email)'}  ${user.uid}  ${providersOf(user)}  ${String(documents)} docs`,
    );
  }
  console.log('');

  if (!has('delete')) {
    console.log('Dry run. Re-run with --delete to apply.');
    return;
  }

  for (const user of matched) {
    // Data first, login second. The other order would leave documents that no
    // security rule can ever match again, since the rules key on the uid.
    await db.recursiveDelete(db.collection(USERS).doc(user.uid));
    await auth.deleteUser(user.uid);
    console.log(`  deleted ${user.email ?? user.uid}`);
  }

  console.log(`\nDone. ${String(matched.length)} accounts and their data removed.`);
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
