/**
 * Pure domain types. No React, no Firebase — Firestore `Timestamp` values are
 * mapped to ISO strings by the converters in `src/data/converters`.
 */

export const UNITS = ['lb', 'kg'] as const;
export type Unit = (typeof UNITS)[number];

/** A load recorded *as entered*. Conversion happens at the edges only. */
export type Weight = { value: number; unit: Unit };

export type UserProfile = {
  displayUnit: Unit;
  defaultRestSeconds: number;
  /** ISO-8601 instant. */
  createdAt: string | null;
};

export const DEFAULT_PROFILE: UserProfile = {
  displayUnit: 'lb',
  defaultRestSeconds: 120,
  createdAt: null,
};
