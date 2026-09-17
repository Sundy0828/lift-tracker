/**
 * Pure domain types. No React, no Firebase — Firestore `Timestamp` values are
 * mapped to ISO strings by the converters in `src/data/converters`.
 */

export const UNITS = ['lb', 'kg'] as const;
export type Unit = (typeof UNITS)[number];

/** A load recorded *as entered*. Conversion happens at the edges only. */
export type Weight = { value: number; unit: Unit };

export const HANDEDNESS = ['right', 'left'] as const;

/** Which hand holds the phone while a set is logged. */
export type Handedness = (typeof HANDEDNESS)[number];

export function isHandedness(value: unknown): value is Handedness {
  return typeof value === 'string' && (HANDEDNESS as readonly string[]).includes(value);
}

export type UserProfile = {
  displayUnit: Unit;
  defaultRestSeconds: number;
  /** Starts the rest timer when a set is finished. */
  autoStartRest: boolean;
  /** Plays a tone as well as vibrating when a rest runs out. */
  restChime: boolean;
  /** Today lists only what this weekday is scheduled for. */
  scheduleFilter: boolean;
  /** Side the per-exercise controls sit on. */
  handedness: Handedness;
  /** This account's friend code, or null until one is minted. */
  friendCode: string | null;
  /** The name a friend code shows the person who holds it. Never the email. */
  displayName: string;
  /** Which build of the day index this account holds. 0 means none yet. */
  dayIndexVersion: number;
  /** The newest walkthrough this account has been shown. 0 means none. */
  tourVersion: number;
  /** ISO-8601 instant. */
  createdAt: string | null;
};

export const DEFAULT_PROFILE: UserProfile = {
  displayUnit: 'lb',
  defaultRestSeconds: 90,
  autoStartRest: true,
  restChime: true,
  scheduleFilter: true,
  handedness: 'right',
  friendCode: null,
  displayName: '',
  dayIndexVersion: 0,
  tourVersion: 0,
  createdAt: null,
};
