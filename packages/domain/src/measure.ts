/**
 * What a set is counted in: reps, time, or distance.
 *
 * Most lifts are a load for some reps. A plank is held for a time, a sled is
 * pushed for a distance, and a carry can be either — so the measure belongs to
 * the **slot** (its prescription says "3 x 30-60s"), and each session row
 * carries a copy, since an ad-hoc row has no prescription to read it from.
 *
 * **Each measure has its own field on a set** (`reps`, `seconds`, `distance`)
 * rather than one number read three ways. That is what keeps everything that
 * means *reps* honest without being told about the others: estimated 1RM,
 * records and the swapped-numbers check all read `reps`, so a 45-second hold
 * can never be scored as a 45-rep set. A load stays optional alongside time
 * and distance (a weighted plank, a loaded carry).
 *
 * Distances are stored as entered, `{ value, unit }`, like weights (§2.7), and
 * compared in metres.
 */

export const MEASURES = ['reps', 'time', 'distance'] as const;
export type Measure = (typeof MEASURES)[number];

export const DISTANCE_UNITS = ['m', 'km', 'yd', 'mi'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

/** A distance as entered. */
export type Distance = { value: number; unit: DistanceUnit };

export const DEFAULT_MEASURE: Measure = 'reps';
export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'm';

const METRES_PER: Record<DistanceUnit, number> = {
  m: 1,
  km: 1000,
  yd: 0.9144,
  mi: 1609.344,
};

export function isMeasure(value: unknown): value is Measure {
  return typeof value === 'string' && (MEASURES as readonly string[]).includes(value);
}

export function isDistanceUnit(value: unknown): value is DistanceUnit {
  return typeof value === 'string' && (DISTANCE_UNITS as readonly string[]).includes(value);
}

export function toMetres(distance: Distance): number {
  return distance.value * METRES_PER[distance.unit];
}

export function fromMetres(metres: number, unit: DistanceUnit): number {
  return metres / METRES_PER[unit];
}

/** Longest time a set or a target may hold: ten hours, past any real set. */
export const MAX_SET_SECONDS = 36_000;

/** Furthest a set or a target may go, in its own unit: a marathon in metres and then some. */
export const MAX_DISTANCE = 100_000;

/** The label for each measure, as the editors offer it. */
export const MEASURE_LABELS: Record<Measure, string> = {
  reps: 'Reps',
  time: 'Time',
  distance: 'Distance',
};

/**
 * Seconds as `45s`, `1:30` or `1:02:05`: the shape a stopwatch shows.
 * Under a minute stays in seconds, because "0:45" reads as a clock time.
 */
export function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${String(whole)}s`;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours === 0
    ? `${String(minutes)}:${rest}`
    : `${String(hours)}:${String(minutes).padStart(2, '0')}:${rest}`;
}

/**
 * A typed time: `90`, `1:30` or `1:02:05`. Plain digits are seconds. Null for
 * anything else, including a negative.
 */
export function parseSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split(':');
  if (parts.length > 3 || parts.some((part) => !/^\d+$/u.test(part))) return null;
  const total = parts.reduce((sum, part) => sum * 60 + Number(part), 0);
  return Number.isFinite(total) ? total : null;
}

function trimmed(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatDistance(distance: Distance): string {
  return `${trimmed(distance.value)} ${distance.unit}`;
}

/** One target number, in the measure's own terms: `12`, `45s`, `400 m`. */
export function formatAmount(value: number, measure: Measure, unit: DistanceUnit): string {
  if (measure === 'time') return formatSeconds(value);
  if (measure === 'distance') return `${trimmed(value)} ${unit}`;
  return String(value);
}

/**
 * A target range: `8-12`, `30s-1:00`, `20-40 m`. A fixed target prints once.
 * Reps carry no unit, as the web has always written them.
 */
export function formatTarget(
  range: { min: number; max: number },
  measure: Measure,
  unit: DistanceUnit,
): string {
  if (measure === 'reps') {
    return range.min === range.max
      ? String(range.min)
      : `${String(range.min)}-${String(range.max)}`;
  }
  if (measure === 'time') {
    return range.min === range.max
      ? formatSeconds(range.min)
      : `${formatSeconds(range.min)}-${formatSeconds(range.max)}`;
  }
  return range.min === range.max
    ? `${trimmed(range.min)} ${unit}`
    : `${trimmed(range.min)}-${trimmed(range.max)} ${unit}`;
}

/** Bounds and steps for a target of each measure, for the editors. */
export const TARGET_BOUNDS: Record<
  Measure,
  {
    floor: number;
    ceiling: number;
    minGap: number;
    step: number;
    defaults: { min: number; max: number };
  }
> = {
  reps: { floor: 1, ceiling: 100, minGap: 2, step: 1, defaults: { min: 8, max: 12 } },
  time: { floor: 5, ceiling: MAX_SET_SECONDS, minGap: 5, step: 5, defaults: { min: 30, max: 60 } },
  distance: {
    floor: 1,
    ceiling: MAX_DISTANCE,
    minGap: 1,
    step: 1,
    defaults: { min: 20, max: 40 },
  },
};

/** How the number box for a set's amount behaves, per measure. */
export type AmountInput = {
  placeholder: string;
  step: number;
  max: number;
  /** Distances take a decimal point; reps and seconds do not. */
  decimal: boolean;
};

export function amountInput(measure: Measure, unit: DistanceUnit): AmountInput {
  if (measure === 'time')
    return { placeholder: 'sec', step: 5, max: MAX_SET_SECONDS, decimal: false };
  if (measure === 'distance') {
    const long = unit === 'km' || unit === 'mi';
    return { placeholder: unit, step: long ? 0.1 : 5, max: MAX_DISTANCE, decimal: true };
  }
  return { placeholder: 'reps', step: 1, max: 100, decimal: false };
}
