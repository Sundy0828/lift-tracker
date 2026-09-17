import { serverTimestamp, setDoc } from 'firebase/firestore';
import type { Handedness, Unit } from '@/domain/types';
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
    autoStartRest: DEFAULT_PROFILE.autoStartRest,
    restChime: DEFAULT_PROFILE.restChime,
    scheduleFilter: DEFAULT_PROFILE.scheduleFilter,
    handedness: DEFAULT_PROFILE.handedness,
    friendCode: DEFAULT_PROFILE.friendCode,
    displayName: DEFAULT_PROFILE.displayName,
    dayIndexVersion: DEFAULT_PROFILE.dayIndexVersion,
    tourVersion: DEFAULT_PROFILE.tourVersion,
    createdAt: serverTimestamp(),
  });
}

export function setDisplayUnit(uid: string, unit: Unit): Promise<void> {
  return setDoc(paths.user(uid), { displayUnit: unit }, { merge: true });
}

export function setDefaultRestSeconds(uid: string, seconds: number): Promise<void> {
  return setDoc(paths.user(uid), { defaultRestSeconds: seconds }, { merge: true });
}

/** Turns the automatic rest timer on or off. */
export function setAutoStartRest(uid: string, enabled: boolean): Promise<void> {
  return setDoc(paths.user(uid), { autoStartRest: enabled }, { merge: true });
}

/** Turns the end-of-rest tone on or off. The vibration is always on. */
export function setRestChime(uid: string, enabled: boolean): Promise<void> {
  return setDoc(paths.user(uid), { restChime: enabled }, { merge: true });
}

/** Narrows Today to the workouts this weekday is scheduled for. */
export function setScheduleFilter(uid: string, enabled: boolean): Promise<void> {
  return setDoc(paths.user(uid), { scheduleFilter: enabled }, { merge: true });
}

/**
 * Records that the day index has been built to this version.
 *
 * Written after the index itself, so an interrupted rebuild is retried rather
 * than remembered as finished (see `mutations/dayIndex`).
 */
export function setDayIndexVersion(uid: string, version: number): Promise<void> {
  return setDoc(paths.user(uid), { dayIndexVersion: version }, { merge: true });
}

/**
 * Records which walkthrough this account has seen.
 *
 * On the profile rather than the device, so the tour follows the account: the
 * second phone should not start it over. Set back to 0 to show it again.
 */
export function setTourVersion(uid: string, version: number): Promise<void> {
  return setDoc(paths.user(uid), { tourVersion: version }, { merge: true });
}

/** Sets the side the per-exercise controls sit on. */
export function setHandedness(uid: string, handedness: Handedness): Promise<void> {
  return setDoc(paths.user(uid), { handedness }, { merge: true });
}
