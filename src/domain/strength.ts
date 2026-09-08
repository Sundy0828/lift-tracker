import type { LoggedSet } from './sessions';
import { performedSets } from './sessions';
import type { Unit, Weight } from './types';
import { formatNumber, fromKg, toKg } from './units';

/**
 * Strength math: estimated 1RM, set-to-set comparison, and PR detection
 * (§2.6).
 *
 * **Everything here works in kilograms.** A set logged in lb and a set logged
 * in kg have to be comparable, and storing weights as entered (§2.7) means the
 * two units genuinely do mix inside one exercise's history. Callers convert to
 * the display unit at the last moment.
 *
 * **Comparison is on estimated 1RM, not raw weight**, so 185 × 8 and 195 × 5
 * resolve correctly instead of the heavier-but-shorter set always winning.
 */

/** Epley's divisor. 1RM ≈ w × (1 + reps / 30). */
export const EPLEY_DIVISOR = 30;

/**
 * How close two kilogram figures have to be to count as the same load.
 *
 * Ten grams: far below any real plate increment (1.25 kg / 2.5 lb), and well
 * above the rounding noise of lb-to-kg conversion — 220.462 lb and 100 kg are
 * the same weight entered in two units, and must not read as a 0.1 g PR.
 */
const EPSILON = 0.01;

export function epley(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / EPLEY_DIVISOR);
}

/** The part of a set the strength math needs. A `LoggedSet` satisfies it. */
export type SetLoad = {
  weight: Weight | null;
  reps: number | null;
  rir: number | null;
};

/** The load in kilograms, or null when nothing was entered. */
export function loadKg(set: SetLoad): number | null {
  return set.weight === null ? null : toKg(set.weight);
}

/** Estimated 1RM from what was actually performed. Ignores RIR. */
export function e1rm(set: SetLoad): number | null {
  const kilograms = loadKg(set);
  if (kilograms === null || set.reps === null || set.reps <= 0) return null;
  return epley(kilograms, set.reps);
}

/**
 * Estimated 1RM adjusted for reps left in reserve — the capacity estimate.
 *
 * RIR is added to the reps before estimating, so 185 × 8 @ 2 RIR scores as if
 * it were 185 × 10: what you *could* have done. This is the metric every
 * comparison and every PR uses, because without it a set taken closer to
 * failure would score as an improvement over a heavier easy one, and a
 * training week where you simply pushed harder would read as getting stronger.
 *
 * A set with no RIR recorded is treated as taken to failure (RIR 0). That is
 * the conservative reading: it never inflates the estimate.
 */
export function adjustedE1rm(set: SetLoad): number | null {
  const kilograms = loadKg(set);
  if (kilograms === null || set.reps === null || set.reps <= 0) return null;
  return epley(kilograms, set.reps + (set.rir ?? 0));
}

export type Direction = 'up' | 'down' | 'same';

export type SetComparison = {
  direction: Direction;
  /** Adjusted-e1RM difference in kg. Signed. */
  e1rmDeltaKg: number;
  /** Signed load difference in kg, or null if either side has no load. */
  weightDeltaKg: number | null;
  repsDelta: number | null;
  rirDelta: number | null;
};

/**
 * Compares one set against the same set last time.
 *
 * Null when either side is incomplete — an unfinished row has nothing to
 * compare, and guessing at it would put a delta chip on an empty input.
 */
export function compareSets(current: SetLoad, previous: SetLoad): SetComparison | null {
  const now = adjustedE1rm(current);
  const before = adjustedE1rm(previous);
  if (now === null || before === null) return null;

  const e1rmDeltaKg = now - before;
  const currentKg = loadKg(current);
  const previousKg = loadKg(previous);

  return {
    direction: e1rmDeltaKg > EPSILON ? 'up' : e1rmDeltaKg < -EPSILON ? 'down' : 'same',
    e1rmDeltaKg,
    weightDeltaKg: currentKg === null || previousKg === null ? null : currentKg - previousKg,
    repsDelta:
      current.reps === null || previous.reps === null ? null : current.reps - previous.reps,
    rirDelta: current.rir === null || previous.rir === null ? null : current.rir - previous.rir,
  };
}

function signed(value: number, unit: string): string {
  const sign = value > 0 ? '+' : '−';
  return `${sign}${formatNumber(Math.abs(value))}${unit === '' ? '' : ` ${unit}`}`;
}

/**
 * The delta chip's text: the *one* thing that changed.
 *
 * Mid-set, on a phone, one figure reads and three do not — and the interesting
 * figure is almost always the one you deliberately changed. So it reports the
 * load if the load moved, else the reps, else the effort, and `=` when the set
 * was repeated exactly.
 *
 * The load difference is rendered in the display unit, converted from kg, so a
 * set logged in kg last time reads as a sane pound figure now.
 */
export function describeDelta(comparison: SetComparison, displayUnit: Unit): string {
  const { weightDeltaKg, repsDelta, rirDelta } = comparison;

  if (weightDeltaKg !== null && Math.abs(weightDeltaKg) > EPSILON) {
    return signed(fromKg(weightDeltaKg, displayUnit), displayUnit);
  }
  if (repsDelta !== null && repsDelta !== 0) {
    return signed(repsDelta, Math.abs(repsDelta) === 1 ? 'rep' : 'reps');
  }
  // Reported literally, like the other two. It happens to agree with the
  // direction: fewer reps in reserve at the same load is more effort for the
  // same result, so RIR falling and performance falling are the same sign.
  if (rirDelta !== null && rirDelta !== 0) return signed(rirDelta, 'RIR');
  return '=';
}

// --- Personal records -----------------------------------------------------

/**
 * The best of a group of sets, by adjusted e1RM.
 *
 * Warmups and skipped sets are excluded by `performedSets`, so a warmup can
 * never take the record and an unfilled row can never be "the best set".
 * Ties keep the earlier set: the record belongs to whoever set it first.
 */
export function bestSet(sets: readonly LoggedSet[]): LoggedSet | null {
  let best: LoggedSet | null = null;
  let bestScore = -Infinity;

  for (const set of performedSets(sets)) {
    const score = adjustedE1rm(set);
    if (score === null || score <= bestScore) continue;
    best = set;
    bestScore = score;
  }
  return best;
}

/**
 * Whether a candidate beats the stored record.
 *
 * Strictly greater, with float slack: repeating your best set exactly is not a
 * new PR, and a PR toast every week for the same numbers would train you to
 * ignore it.
 */
export function beatsRecord(candidateE1rmKg: number, recordE1rmKg: number): boolean {
  return candidateE1rmKg > recordE1rmKg + EPSILON;
}

/** Formats an e1RM in kg for display, e.g. `est. 1RM 232.5 lb`. */
export function formatE1rm(e1rmKg: number, displayUnit: Unit): string {
  return `${formatNumber(fromKg(e1rmKg, displayUnit))} ${displayUnit}`;
}

/** Renders `185 × 9 @ 2 RIR`, omitting the parts that were not recorded. */
export function formatSet(
  set: SetLoad,
  displayUnit: Unit,
  options: { withUnit?: boolean } = {},
): string {
  const { withUnit = true } = options;
  const kilograms = loadKg(set);
  const load =
    kilograms === null
      ? '—'
      : `${formatNumber(fromKg(kilograms, displayUnit))}${withUnit ? ` ${displayUnit}` : ''}`;
  const reps = set.reps === null ? '' : ` × ${formatNumber(set.reps, 0)}`;
  const rir = set.rir === null ? '' : ` @ ${formatNumber(set.rir, 0)} RIR`;
  return `${load}${reps}${rir}`;
}
