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
  /** Side the per-exercise controls sit on. */
  handedness: Handedness;
  /** ISO-8601 instant. */
  createdAt: string | null;
};

export const DEFAULT_PROFILE: UserProfile = {
  displayUnit: 'lb',
  defaultRestSeconds: 90,
  autoStartRest: true,
  handedness: 'right',
  createdAt: null,
};
