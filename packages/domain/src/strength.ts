import type { Equipment, Exercise, ExerciseResolver } from './exercises';
import type { Distance } from './measure';
import { formatDistance, formatSeconds, toMetres } from './measure';
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

/**
 * The bodyweight a bodyweight or assisted set is scored against, in kg.
 *
 * Epley on the bar's load alone scores every pull-up at 0 kg as 0, however
 * many reps, and scores assistance (a negative load) as *less* the more reps
 * you do. Neither tracks progress. So a bodyweight lift is scored as the whole
 * body moving: `epley(REF + load) - REF`, the estimated single **added** to
 * bodyweight. 10 reps unassisted scores about +27 kg; 10 reps with 20 kg of
 * help scores 0; less help or more reps scores higher, which is what progress
 * on an assisted machine looks like.
 *
 * **Which sets get this is decided per exercise, not per set** (`LoadScale`).
 * It used to be decided by the sign of the load — zero or below on this
 * scale, anything positive on plain Epley — and the seam at zero was a cliff:
 * 0 kg × 10 dips scored about 26.7, +20 kg × 8 on a belt scored 25.3, so
 * adding weight read as getting weaker and a light weighted set could never
 * beat an unweighted one. Now a bodyweight exercise uses this formula at
 * every load, added weight included (+20 kg × 8 is `epley(100, 8) - 80`,
 * about 46.7), which is continuous through zero and only rises with the load.
 *
 * Every other exercise keeps plain Epley for a positive load, so no barbell
 * or dumbbell record changes. A load of zero or below on one of those still
 * falls back to this formula: an assisted set logged on a custom exercise with
 * no equipment recorded has no other sensible score.
 *
 * A fixed reference rather than your logged bodyweight, so a lighter morning
 * cannot move a record.
 */
export const BODYWEIGHT_REFERENCE_KG = 80;

/**
 * Which formula an exercise's sets are scored on.
 *
 * - `bodyweight`: the body is the load, and the logged weight is added to it
 *   (a belt) or taken off it (an assisted machine, as a negative load). Scored
 *   against `BODYWEIGHT_REFERENCE_KG` at every load.
 * - `external`: the logged weight is the load. Plain Epley, except that a load
 *   of zero or below falls back to the bodyweight formula (see above).
 *
 * A property of the exercise rather than the set, because a record compares
 * sets of one exercise against each other and they must all sit on one scale.
 * Passed in by the caller, which has the exercise library: this module stays a
 * pure function of numbers. Required everywhere rather than defaulted, so no
 * caller can quietly score a dip on the barbell scale.
 */
export type LoadScale = 'bodyweight' | 'external';

/** An exercise id's scale, for code that walks every exercise of a session. */
export type LoadScaleOf = (exerciseId: string) => LoadScale;

/**
 * Equipment that means the body is the load.
 *
 * free-exercise-db has one such value, `body only` (pull-ups, chin-ups,
 * push-ups, bench and triceps dips), and no assisted-machine value: its
 * `machine` covers the leg press and the Smith machine too, so it cannot be
 * read as bodyweight. Bodyweight lifts it files elsewhere are listed by id in
 * `BODYWEIGHT_EXERCISE_IDS`; a custom exercise marked `body only` is the way to
 * put one of your own on this scale.
 */
export const BODYWEIGHT_EQUIPMENT: readonly Equipment[] = ['body only'];

/**
 * Catalog lifts where the body is the load, filed under another equipment
 * value (mostly `other`): dips, chins, muscle-ups, ring and strap work. Ids are
 * the catalog's, so they never match a custom exercise. `catalog.test.ts`
 * checks each still exists after a catalog refresh.
 */
export const BODYWEIGHT_EXERCISE_IDS: readonly string[] = [
  'Band_Assisted_Pull-Up',
  'Dips_-_Chest_Version',
  'Gironda_Sternum_Chins',
  'Inverted_Row_with_Straps',
  'Kipping_Muscle_Up',
  'Mixed_Grip_Chin',
  'Muscle_Up',
  'One_Arm_Chin-Up',
  'Parallel_Bar_Dip',
  'Push-Ups_With_Feet_On_An_Exercise_Ball',
  'Ring_Dips',
  'Side_To_Side_Chins',
  'Suspended_Push-Up',
  'Weighted_Bench_Dip',
];

/**
 * The scale an exercise is scored on, from its equipment (or its id, for the
 * catalog lifts above).
 *
 * An exercise that cannot be resolved (a deleted custom exercise, or the
 * library still loading) is `external`: on that scale a positive load scores
 * exactly as it always has, and an assisted one still gets the bodyweight
 * fallback.
 */
export function loadScaleFor(exercise: Pick<Exercise, 'id' | 'equipment'> | null): LoadScale {
  if (exercise === null) return 'external';
  if (BODYWEIGHT_EXERCISE_IDS.includes(exercise.id)) return 'bodyweight';
  const equipment = exercise.equipment;
  return equipment !== null && BODYWEIGHT_EQUIPMENT.includes(equipment) ? 'bodyweight' : 'external';
}

/** `loadScaleFor` over a whole library, in the shape the record code takes. */
export function loadScaleLookup(resolver: ExerciseResolver): LoadScaleOf {
  return (exerciseId) => loadScaleFor(resolver.resolve(exerciseId));
}

/** Whether a set is read against bodyweight rather than as a bar weight. */
function isBodyweightScored(kilograms: number, scale: LoadScale): boolean {
  return scale === 'bodyweight' || kilograms <= 0;
}

/** A set's score from its load, its effective reps (reps plus any RIR) and its scale. */
function score(kilograms: number, effectiveReps: number, scale: LoadScale): number {
  if (!isBodyweightScored(kilograms, scale)) return epley(kilograms, effectiveReps);
  return epley(BODYWEIGHT_REFERENCE_KG + kilograms, effectiveReps) - BODYWEIGHT_REFERENCE_KG;
}

/** The part of a set the strength math needs. A `LoggedSet` satisfies it. */
export type SetLoad = {
  weight: Weight | null;
  reps: number | null;
  rir: number | null;
  /** A timed set's length. Absent and null both mean "not timed". */
  seconds?: number | null;
  /** A distance set's distance. */
  distance?: Distance | null;
};

/** The load in kilograms, or null when nothing was entered. */
export function loadKg(set: SetLoad): number | null {
  return set.weight === null ? null : toKg(set.weight);
}

/** Estimated 1RM from what was actually performed. Ignores RIR. */
export function e1rm(set: SetLoad, scale: LoadScale): number | null {
  const kilograms = loadKg(set);
  if (kilograms === null || set.reps === null || set.reps <= 0) return null;
  return score(kilograms, set.reps, scale);
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
 *
 * `scale` is the exercise's (see `LoadScale`): every set of one exercise has
 * to be scored on the same one, or a record would compare across two scales.
 */
export function adjustedE1rm(set: SetLoad, scale: LoadScale): number | null {
  const kilograms = loadKg(set);
  if (kilograms === null || set.reps === null || set.reps <= 0) return null;
  return score(kilograms, set.reps + (set.rir ?? 0), scale);
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
  /** Signed, for two timed sets. */
  secondsDelta?: number;
  /** Signed, in metres, for two distance sets. */
  metresDelta?: number;
};

/**
 * Two timed sets, or two distance sets: longer or further is better, and the
 * load (a weighted plank, a loaded carry) decides a tie. Null when the two
 * are not the same kind of set, or either is unfinished.
 */
function compareAmounts(current: SetLoad, previous: SetLoad): SetComparison | null {
  const currentKg = loadKg(current);
  const previousKg = loadKg(previous);
  const weightDeltaKg = currentKg === null || previousKg === null ? null : currentKg - previousKg;
  const rirDelta =
    current.rir === null || previous.rir === null ? null : current.rir - previous.rir;

  let amountDelta: number;
  let extra: { secondsDelta: number } | { metresDelta: number };
  if (typeof current.seconds === 'number' && typeof previous.seconds === 'number') {
    amountDelta = current.seconds - previous.seconds;
    extra = { secondsDelta: amountDelta };
  } else if (
    current.distance !== undefined &&
    current.distance !== null &&
    previous.distance !== undefined &&
    previous.distance !== null
  ) {
    amountDelta = toMetres(current.distance) - toMetres(previous.distance);
    extra = { metresDelta: amountDelta };
  } else {
    return null;
  }

  const tieBreak = weightDeltaKg ?? 0;
  const direction: Direction =
    amountDelta > EPSILON
      ? 'up'
      : amountDelta < -EPSILON
        ? 'down'
        : tieBreak > EPSILON
          ? 'up'
          : tieBreak < -EPSILON
            ? 'down'
            : 'same';

  return {
    direction,
    e1rmDeltaKg: 0,
    weightDeltaKg,
    repsDelta: null,
    rirDelta,
    ...extra,
  };
}

function isAmountSet(set: SetLoad): boolean {
  return (
    (set.seconds !== undefined && set.seconds !== null) ||
    (set.distance !== undefined && set.distance !== null)
  );
}

/**
 * Compares one set against the same set last time.
 *
 * Null when either side is incomplete — an unfinished row has nothing to
 * compare, and guessing at it would put a delta chip on an empty input.
 * Both sets are of one exercise, so they share its `scale`.
 */
export function compareSets(
  current: SetLoad,
  previous: SetLoad,
  scale: LoadScale,
): SetComparison | null {
  if (isAmountSet(current) || isAmountSet(previous)) return compareAmounts(current, previous);
  const now = adjustedE1rm(current, scale);
  const before = adjustedE1rm(previous, scale);
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

export type DeltaChip = {
  /** The short label on the chip itself. */
  label: string;
  direction: Direction;
  /** The whole comparison in words, for a tooltip. */
  detail: string;
};

/**
 * What changed since last time, as a chip plus an explanation.
 *
 * **Every axis that moved is named.** An earlier version reported only the
 * most significant one, which produced the genuinely misleading case of
 * 45 × 15 becoming 50 × 12 and reading as a red "+5 lb" — the label said the
 * load went up, the colour said the set was worse, and the reps that explained
 * the contradiction were nowhere. So when more than one of load, reps and
 * effort moved, the chip says so: `+5 lb · −3 reps`. The colour still comes
 * from the estimated 1RM, which is the only thing that can adjudicate a
 * trade-off between load and reps, and the tooltip states the verdict outright.
 *
 * Load differences are rendered in the display unit, converted from kg, so a
 * set logged in kg last time reads as a sane pound figure now.
 */
export function describeComparison(
  current: SetLoad,
  previous: SetLoad,
  displayUnit: Unit,
  scale: LoadScale,
): DeltaChip | null {
  const comparison = compareSets(current, previous, scale);
  if (comparison === null) return null;

  const { direction, e1rmDeltaKg, weightDeltaKg, repsDelta, rirDelta } = comparison;
  const { secondsDelta, metresDelta } = comparison;

  const parts: string[] = [];
  // The time or distance first: for those sets it is the number that moved.
  if (secondsDelta !== undefined && secondsDelta !== 0) {
    parts.push(`${secondsDelta > 0 ? '+' : '−'}${formatSeconds(Math.abs(secondsDelta))}`);
  }
  if (metresDelta !== undefined && Math.abs(metresDelta) > EPSILON) {
    parts.push(signed(metresDelta, 'm'));
  }
  if (weightDeltaKg !== null && Math.abs(weightDeltaKg) > EPSILON) {
    parts.push(signed(fromKg(weightDeltaKg, displayUnit), displayUnit));
  }
  if (repsDelta !== null && repsDelta !== 0) {
    parts.push(signed(repsDelta, Math.abs(repsDelta) === 1 ? 'rep' : 'reps'));
  }
  // Reported literally, like the other two, and it happens to agree with the
  // direction: fewer reps in reserve at the same load is more effort for the
  // same result, so RIR falling and capacity falling share a sign.
  if (rirDelta !== null && rirDelta !== 0) parts.push(signed(rirDelta, 'RIR'));

  const amountSet = secondsDelta !== undefined || metresDelta !== undefined;
  const verdict = amountSet
    ? direction === 'same'
      ? 'no change'
      : direction === 'up'
        ? secondsDelta !== undefined
          ? 'longer'
          : 'further'
        : secondsDelta !== undefined
          ? 'shorter'
          : 'less far'
    : direction === 'same'
      ? 'estimated 1RM unchanged'
      : `estimated 1RM ${direction === 'up' ? 'up' : 'down'} ${formatNumber(
          Math.abs(fromKg(e1rmDeltaKg, displayUnit)),
        )} ${displayUnit}`;

  const detail = `${formatSet(current, displayUnit)} vs ${formatSet(
    previous,
    displayUnit,
  )} — ${verdict}`;

  if (parts.length === 0) return { label: '=', direction, detail };

  // Two is the most a chip can carry on a phone without wrapping. A third
  // moved axis is rare and the tooltip has it.
  return { label: parts.slice(0, 2).join(' · '), direction, detail };
}

// --- Personal records -----------------------------------------------------

/**
 * The best of a group of sets, by adjusted e1RM.
 *
 * Warmups and skipped sets are excluded by `performedSets`, so a warmup can
 * never take the record and an unfilled row can never be "the best set".
 * Ties keep the earlier set: the record belongs to whoever set it first.
 */
export function bestSet(sets: readonly LoggedSet[], scale: LoadScale): LoggedSet | null {
  let best: LoggedSet | null = null;
  let bestScore = -Infinity;

  for (const set of performedSets(sets)) {
    const score = adjustedE1rm(set, scale);
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

/**
 * Where an estimate came from, for a tooltip beside the number.
 *
 * A record reading `61.3 lb` next to a set of `40 lb × 15` looks wrong until
 * you know it is an estimated **single**, not a weight anybody lifted — and
 * that reps in reserve are counted as reps you had left. Both are stated here
 * rather than left to be worked out.
 *
 * A long set gets a caveat as well. Epley is a straight line through a curve,
 * and past about ten reps it reads high; a record set at fifteen reps is a
 * real number but a soft one.
 *
 * A set scored against bodyweight (see `BODYWEIGHT_REFERENCE_KG`) is explained
 * that way instead: its number is what was added to the body, not a bar.
 */
export function describeE1rm(set: SetLoad, displayUnit: Unit, scale: LoadScale): string | null {
  const score = adjustedE1rm(set, scale);
  if (score === null || set.reps === null) return null;

  const effective = set.reps + (set.rir ?? 0);
  const kilograms = loadKg(set) ?? 0;
  if (isBodyweightScored(kilograms, scale)) {
    const reserve =
      set.rir === null || set.rir === 0 ? '' : ` Reps in reserve count as reps you had left.`;
    const single =
      score > 0
        ? `a single with ${formatE1rm(score, displayUnit)} added`
        : score < 0
          ? `a single with ${formatE1rm(-score, displayUnit)} of assistance`
          : 'a single at bodyweight';
    return `${formatSet(set, displayUnit)} estimates ${single}, scored as if you weigh ${formatE1rm(
      BODYWEIGHT_REFERENCE_KG,
      displayUnit,
    )}, so ${
      kilograms > 0 ? 'more added weight' : 'less assistance'
    } and more reps both count as progress.${reserve}`;
  }
  const reserve =
    set.rir === null || set.rir === 0
      ? ''
      : ` Reps in reserve count as reps you had left, so it scores as ${String(effective)}.`;
  const rough =
    effective > LONG_SET_REPS
      ? ' Past about ten reps the estimate reads high, so treat a long set as a rough one.'
      : '';

  return `${formatSet(set, displayUnit)} estimates a single of ${formatE1rm(score, displayUnit)}.${reserve}${rough}`;
}

/** Past this many effective reps, Epley drifts high enough to be worth saying. */
const LONG_SET_REPS = 12;

/**
 * Renders `185 × 9 @ 2 RIR`, `-20 lb × 8` (assisted), `45s`, `50 lb × 40 m`,
 * omitting the parts that were not recorded. A time or distance with no load
 * stands alone, since the load is optional there.
 */
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
  const rir = set.rir === null ? '' : ` @ ${formatNumber(set.rir, 0)} RIR`;

  const amount =
    set.seconds !== undefined && set.seconds !== null
      ? formatSeconds(set.seconds)
      : set.distance !== undefined && set.distance !== null
        ? formatDistance(set.distance)
        : null;
  if (amount !== null) {
    return `${kilograms === null ? '' : `${load} × `}${amount}${rir}`;
  }

  const reps = set.reps === null ? '' : ` × ${formatNumber(set.reps, 0)}`;
  return `${load}${reps}${rir}`;
}
