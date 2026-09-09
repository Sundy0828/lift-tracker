import {
  EmailAuthProvider,
  deleteUser,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  unlink,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  getDocFromServer,
  getDocsFromServer,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { markAccountDeleted } from '../deletedAccounts';
import { googleProvider } from '../firebase';
import { db } from '../firestore';
import { paths } from '../paths';
import { resetProfile } from './profile';

/**
 * Deleting an account, for real.
 *
 * Every other write in the app is fire-and-forget against the local cache
 * (§2.8). This one is the exact opposite and deliberately so: it is awaited,
 * it reads from the **server** rather than the cache, and it fails loudly.
 * Deleting from a stale cache would leave documents behind that the user has
 * been told are gone, and there would be no account left to sign in and find
 * them with.
 *
 * The order is fixed: prove the session is fresh, then delete the data, then
 * delete the login. Reversing the last two would strand the data — the
 * security rules key on `request.auth.uid`, so once the login is gone nothing
 * can ever reach those documents again, to delete them or otherwise.
 */

/** Firestore caps a batch at 500 writes; leave headroom for the user doc. */
const BATCH_LIMIT = 450;

export type ReauthMethod = 'google' | 'password' | 'unsupported';

/**
 * How this account has to prove it is really at the keyboard.
 *
 * Firebase demands a recent sign-in before it will delete a user, and the way
 * to satisfy it depends on how they signed in originally.
 */
export function reauthMethod(user: User): ReauthMethod {
  const providers = user.providerData.map((entry) => entry.providerId);
  if (providers.includes('google.com')) return 'google';
  if (providers.includes('password')) return 'password';
  return 'unsupported';
}

/**
 * Re-proves the sign-in before anything is destroyed.
 *
 * Done up front rather than in response to `auth/requires-recent-login` on the
 * final step. By that point the data would already be gone, and a cancelled
 * popup would leave an empty account behind — the worst of both outcomes.
 */
export async function reauthenticate(user: User, password: string): Promise<void> {
  const method = reauthMethod(user);

  if (method === 'google') {
    await reauthenticateWithPopup(user, googleProvider);
    return;
  }

  if (method === 'password') {
    if (user.email === null) throw new Error('This account has no email address to sign in with.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return;
  }

  throw new Error('This sign-in method cannot be re-verified in the app. Sign in again first.');
}

/**
 * Changes the password, proving the old one first.
 *
 * Firebase would accept the change on a recent-enough sign-in without ever
 * seeing the current password, which is how a borrowed unlocked phone becomes
 * a stolen account. Requiring it is a deliberate extra step, and it doubles as
 * the recency proof Firebase wants anyway.
 *
 * Google accounts have no password to change; the caller hides this entirely
 * for them rather than failing here.
 */
export async function changePassword(
  user: User,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  if (reauthMethod(user) !== 'password') {
    throw new Error('This account signs in with Google, so it has no password to change.');
  }
  await reauthenticate(user, currentPassword);
  await updatePassword(user, nextPassword);
}

// --- Linking sign-in methods ---------------------------------------------

export const GOOGLE_PROVIDER = 'google.com';
export const PASSWORD_PROVIDER = 'password';

export type SignInMethods = {
  google: boolean;
  password: boolean;
  /** Every provider on the account, including any this app does not offer. */
  all: string[];
};

/**
 * Which ways this account can sign in.
 *
 * One account, several doors. Firebase keys an account on its email, so
 * linking Google to a password account does not merge two accounts — it adds a
 * second way into the one that already holds all the training data. That is
 * exactly what makes it safe to offer.
 */
export function signInMethodsOf(user: User): SignInMethods {
  const all = user.providerData.map((entry) => entry.providerId);
  return {
    google: all.includes(GOOGLE_PROVIDER),
    password: all.includes(PASSWORD_PROVIDER),
    all,
  };
}

/**
 * Retries an operation once, after re-proving the sign-in.
 *
 * Firebase guards account-shape changes on a recent sign-in, and "recent" runs
 * out on its own after a while — so the first attempt failing that way is
 * routine, not an error worth showing anyone. `password` is only consulted for
 * a password account; a Google one re-proves through a popup.
 */
async function withFreshLogin<T>(
  user: User,
  password: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
    if (code !== 'auth/requires-recent-login') throw cause;
    await reauthenticate(user, password);
    return action();
  }
}

/** Adds Google as a way into this account. Opens Google's own popup. */
export async function linkGoogle(user: User): Promise<void> {
  await linkWithPopup(user, googleProvider);
}

/**
 * Adds a password to an account that signs in with Google.
 *
 * The address is taken from the account rather than asked for: a second
 * address here would be a second account, which is the opposite of linking.
 */
export async function linkPassword(user: User, password: string): Promise<void> {
  if (user.email === null || user.email === '') {
    throw new Error('This account has no email address to attach a password to.');
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  // The empty string is the reauth password: a Google account has none, and
  // this path is only reachable for one.
  await withFreshLogin(user, '', () => linkWithCredential(user, credential));
}

/**
 * Removes a sign-in method, refusing to remove the last one.
 *
 * Unlinking the only provider leaves an account nobody can ever sign into
 * again — the data intact and permanently unreachable, which is the same
 * failure as deleting a login before its documents.
 */
export async function unlinkProvider(
  user: User,
  providerId: string,
  password: string,
): Promise<void> {
  const methods = signInMethodsOf(user);
  if (methods.all.length <= 1) {
    throw new Error('This is the only way into the account, so it cannot be removed.');
  }
  await withFreshLogin(user, password, () => unlink(user, providerId));
}

async function refsIn(source: CollectionReference): Promise<DocumentReference[]> {
  // From the server, not the cache: see the note at the top of this module.
  const snapshot = await getDocsFromServer(source);
  return snapshot.docs.map((document) => document.ref);
}

async function deleteRefs(refs: readonly DocumentReference[]): Promise<void> {
  for (let start = 0; start < refs.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(start, start + BATCH_LIMIT)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Everything *beneath* `users/{uid}` — the training data, not the account.
 *
 * Deleting a document in Firestore does **not** delete documents beneath it,
 * so each workout's `versions` subcollection is enumerated and deleted in its
 * own right. Missing that is the classic way to leave an account's history
 * alive underneath a deleted parent, invisible and unreachable.
 */
async function deleteTrainingData(uid: string): Promise<void> {
  const workouts = await refsIn(paths.workouts(uid));

  // Deepest first, so an interruption never leaves a version snapshot orphaned
  // beneath a workout that no longer exists.
  for (const workout of workouts) {
    await deleteRefs(await refsIn(paths.workoutVersions(uid, workout.id)));
  }

  await deleteRefs(workouts);
  await deleteRefs(await refsIn(paths.sessions(uid)));
  await deleteRefs(await refsIn(paths.customExercises(uid)));
  await deleteRefs(await refsIn(paths.workoutStats(uid)));
  await deleteRefs(await refsIn(paths.exerciseStats(uid)));
}

/**
 * Starts over: every workout, session and record gone, the login kept.
 *
 * The profile is rewritten to defaults rather than deleted, so the account
 * comes back the way a new one would — and rewritten explicitly rather than
 * left for `useProfile` to reseed, because that listener only seeds once per
 * subscription and will already have fired on this screen.
 *
 * Deliberately needs no reauthentication: nothing here touches the login, and
 * Firestore has no recency requirement. The typed confirmation in the UI is
 * what stands between this and a mis-tap.
 */
export async function deleteAllData(uid: string): Promise<void> {
  await deleteTrainingData(uid);
  await resetProfile(uid);
}

/**
 * Everything under `users/{uid}`, the profile document included.
 *
 * Used only on the way to deleting the login itself.
 */
export async function deleteAllUserData(uid: string): Promise<void> {
  // Before anything is removed, not after. The profile listener in
  // `useProfile` reads a missing document as a new account and seeds it
  // straight back, so the deletion has to announce itself first or it races
  // the very screen it was started from (see `data/deletedAccounts`).
  markAccountDeleted(uid);

  await deleteTrainingData(uid);

  // The profile document last: it is the one thing whose absence the app reads
  // as "new user", so it should not vanish while history is still being cleared.
  await deleteRefs([paths.user(uid)]);

  // Then confirm, from the server, that it stayed deleted.
  //
  // Belt and braces over the guard above, and worth the single read: this is
  // the last moment the document can be reached at all. Once `deleteUser`
  // runs, the rules have no `request.auth.uid` to match and an account
  // document left behind here is unreachable for good — by the app, by the
  // user, and by any later attempt to clean it up.
  const remaining = await getDocFromServer(paths.user(uid));
  if (remaining.exists()) await deleteDoc(paths.user(uid));
}

/**
 * Hard-deletes the account: all Firestore data, then the login itself.
 *
 * There is no soft delete, no tombstone and no recovery window. `password` is
 * ignored for a Google account, which re-verifies through a popup instead.
 */
export async function deleteAccount(user: User, password: string): Promise<void> {
  await reauthenticate(user, password);
  await deleteAllUserData(user.uid);
  await deleteUser(user);
}
