import { serverTimestamp, setDoc } from 'firebase/firestore';
import type { Unit } from '@/domain/types';
import { DEFAULT_PROFILE } from '@/domain/types';
import { isAccountDeleted } from '../deletedAccounts';
import { paths } from '../paths';

/**
 * Writes are never awaited by the UI: Firestore applies them to the local
 * cache synchronously, listeners re-render from it, and the write flushes when
 * the network returns. The returned promise is for error logging only — never
 * to gate rendering.
 *
 * Every write here is a `merge`, and each one touches only the fields it owns.
 * Seeding the whole profile on sign-in would merge `displayUnit: 'lb'` back
 * over a stored preference on every launch.
 */

/**
 * Stamps `createdAt` on a profile that does not exist yet. Deliberately writes
 * nothing else: `domain/types` supplies a default for every other field, and
 * `parseProfile` falls back field-by-field, so an absent document already
 * renders correctly. Call only when a snapshot reports the document missing.
 *
 * Refuses for an account being deleted. A missing document means "new user"
 * everywhere else in the app, but during a delete it means the opposite, and
 * seeding it there recreates the one document the deletion just removed —
 * after which the login is gone and nothing can reach it again (see
 * `data/deletedAccounts`).
 */
export function initializeProfile(uid: string): Promise<void> {
  if (isAccountDeleted(uid)) return Promise.resolve();
  return setDoc(paths.user(uid), { createdAt: serverTimestamp() }, { merge: true });
}

/**
 * Puts the profile back to how a new account's would look.
 *
 * The one write in this module that is **not** a merge: resetting means the
 * stored preferences go, and merging defaults over them would leave whatever
 * fields the defaults happen not to mention. `createdAt` is restamped, since
 * as far as the app is now concerned this account starts here.
 */
export function resetProfile(uid: string): Promise<void> {
  return setDoc(paths.user(uid), {
    displayUnit: DEFAULT_PROFILE.displayUnit,
    defaultRestSeconds: DEFAULT_PROFILE.defaultRestSeconds,
    createdAt: serverTimestamp(),
  });
}

export function setDisplayUnit(uid: string, unit: Unit): Promise<void> {
  return setDoc(paths.user(uid), { displayUnit: unit }, { merge: true });
}

export function setDefaultRestSeconds(uid: string, seconds: number): Promise<void> {
  return setDoc(paths.user(uid), { defaultRestSeconds: seconds }, { merge: true });
}
