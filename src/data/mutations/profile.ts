import { serverTimestamp, setDoc } from 'firebase/firestore';
import type { Unit } from '@/domain/types';
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
 */
export function initializeProfile(uid: string): Promise<void> {
  return setDoc(paths.user(uid), { createdAt: serverTimestamp() }, { merge: true });
}

export function setDisplayUnit(uid: string, unit: Unit): Promise<void> {
  return setDoc(paths.user(uid), { displayUnit: unit }, { merge: true });
}

export function setDefaultRestSeconds(uid: string, seconds: number): Promise<void> {
  return setDoc(paths.user(uid), { defaultRestSeconds: seconds }, { merge: true });
}
