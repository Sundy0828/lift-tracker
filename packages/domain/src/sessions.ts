import type { Distance, DistanceUnit, Measure } from './measure';
import {
  DEFAULT_DISTANCE_UNIT,
  MAX_DISTANCE,
  MAX_SET_SECONDS,
  fromMetres,
  isDistanceUnit,
  isMeasure,
  toMetres,
} from './measure';
import type { Unit, Weight } from './types';
import type { Prescription, SlotKind, WorkoutBody } from './workouts';
import {
  MAX_REPS,
  MAX_RIR,
  MAX_SETS,
  clamp,
  distanceUnitOf,
  measureOf,
  occurrenceKey,
  parseGroupRest,
  parsePrescription,
} from './workouts';

/**
 * Sessions: one *performance* of one workout (§2.4).
 *
 * A workout is the reusable template; a session is a single date-stamped
 * attempt at it. Doing PUSH and then ABS on the same day is two sessions,
 * which is what keeps each workout's history clean.
 *
 * **One session is one document.** Every logged set lives in this document's
 * `entries` array, so a whole workout logged in airplane mode is a handful of
 * queued writes and the session is never half-written (§2.8).
 *
 * The entries also carry a **copy of the slots they came from** — name,
 * prescription, circuit group. Two reasons, both load-bearing:
 *
 * - the log screen renders from this one document, so the overlay and the set
 *   grid never wait on a read of the workout or its version snapshot;
 * - a set logged against a prescription keeps the prescription it was logged
 *   against, so editing the workout mid-session cannot rewrite what you have
 *   already done.
 *
 * `workoutVersion` is still recorded, and it stays the authoritative
 * definition that an old session is rendered against (§2.5).
 */

/** A performed set. A `null` field is "not entered yet", not zero. */
export type LoggedSet = {
  /** Position within the entry. Also the key the overlay lines up on. */
  setIndex: number;
  /**
   * The load. Negative is assistance: -20 on an assisted pull-up machine is
   * 20 taken off your bodyweight, so less assistance is a bigger number.
   */
  weight: Weight | null;
  reps: number | null;
  /** How long the set lasted, for a timed set (see `measure`). */
  seconds: number | null;
  /** How far it went, as entered, for a distance set. */
  distance: Distance | null;
  /** Reps in reserve, as actually judged. */
  rir: number | null;
  /**
   * Warmups are logged for the record but excluded from everything that
   * compares performances: no overlay row, no delta, no PR.
   */
  isWarmup: boolean;
  skipped: boolean;
  /**
   * ISO-8601 instant, or null while the set is unfinished.
   *
   * A plain string rather than a `Timestamp` because this lives inside an
   * array: Firestore cannot resolve `serverTimestamp()` in an array element,
   * and when a set finished is a client-side fact anyway — it has to be right
   * while offline.
   */
  completedAt: string | null;
  /** Seconds of rest actually taken after this set, or null if unmeasured. */
  restTakenSeconds: number | null;
};

/**
 * One row of a session: an exercise and the sets performed on it, or a rest
 * row carried over from the workout.
 */
export type SessionEntry = {
  /**
   * The workout slot this came from, or null when added ad-hoc mid-session.
   * Null is the meaningful value: the row corresponds to nothing in the
   * workout, so no version snapshot describes it.
   */
  slotId: string | null;
  kind: SlotKind;
  exerciseId: string;
  exerciseName: string;
  occurrenceIndex: number;
  /** Null for an ad-hoc row, which has no prescription to work to. */
  prescription: Prescription | null;
  /**
   * What an ad-hoc row is counted in. A prescribed row reads its measure from
   * its prescription instead (see `entryMeasure`), so this is only written
   * for a row that has none.
   */
  measure?: Measure;
  distanceUnit?: DistanceUnit;
  sets: LoggedSet[];
  supersetGroup: string | null;
  notes: string;
};

export const SESSION_STATUSES = ['active', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type Session = {
  id: string;
  /** Null for an ad-hoc session, which has no workout history to feed. */
  workoutId: string | null;
  workoutVersion: number | null;
  /** Denormalised: an old session must read under the name it had then. */
  workoutName: string;
  status: SessionStatus;
  /** `YYYY-MM-DD` in the user's local time — the calendar key for history. */
  performedOn: string;
  startedAt: string | null;
  completedAt: string | null;
  entries: SessionEntry[];
  /** Rest after a whole circuit round, keyed by `supersetGroup`. */
  groupRest: Record<string, number | null>;
  bodyweight: Weight | null;
  notes: string;
};

/** What a row's sets are counted in: its prescription's, or its own for an ad-hoc row. */
export function entryMeasure(entry: Pick<SessionEntry, 'prescription' | 'measure'>): Measure {
  return entry.prescription === null ? (entry.measure ?? 'reps') : measureOf(entry.prescription);
}

export function entryDistanceUnit(
  entry: Pick<SessionEntry, 'prescription' | 'distanceUnit'>,
): DistanceUnit {
  return entry.prescription === null
    ? (entry.distanceUnit ?? DEFAULT_DISTANCE_UNIT)
    : distanceUnitOf(entry.prescription);
}

/**
 * The set's number in its measure, comparable across sets: reps, seconds, or
 * metres. Null when it was not entered.
 */
export function setAmount(set: LoggedSet, measure: Measure): number | null {
  if (measure === 'time') return set.seconds;
  if (measure === 'distance') return set.distance === null ? null : toMetres(set.distance);
  return set.reps;
}

/** The set's number in the measure's *entry* unit: reps, seconds, or `unit`. */
export function setAmountIn(set: LoggedSet, measure: Measure, unit: DistanceUnit): number | null {
  if (measure === 'distance') {
    return set.distance === null ? null : fromMetres(toMetres(set.distance), unit);
  }
  return setAmount(set, measure);
}

/**
 * The change that records a typed amount on a set of this row: `reps`,
 * `seconds`, or a distance in the row's unit. Both set-row screens write
 * through this, so neither has to know which field a measure lives in.
 */
export function amountPatch(
  entry: Pick<SessionEntry, 'prescription' | 'measure' | 'distanceUnit'>,
  value: number | null,
): SetPatch {
  const measure = entryMeasure(entry);
  if (measure === 'time') return { seconds: value };
  if (measure === 'distance') {
    return { distance: value === null ? null : { value, unit: entryDistanceUnit(entry) } };
  }
  return { reps: value };
}

export function isRestEntry(entry: SessionEntry): boolean {
  return entry.kind === 'rest';
}

/** Only the rows that are work — what sets, volume and PRs care about. */
export function exerciseEntries(entries: readonly SessionEntry[]): SessionEntry[] {
  return entries.filter((entry) => entry.kind === 'exercise');
}

/**
 * A stable key for one row within a session.
 *
 * An ad-hoc row has no `slotId`, so it falls back to its occurrence key, which
 * is unique among entries by construction — `addAdHocEntry` assigns the next
 * free occurrence index for that exercise. The prefix keeps an ad-hoc row from
 * colliding with a slot id.
 */
export function entryKey(entry: SessionEntry): string {
  return entry.slotId ?? `adhoc:${occurrenceKey(entry.exerciseId, entry.occurrenceIndex)}`;
}

// --- The local calendar date ----------------------------------------------

/**
 * `YYYY-MM-DD` for a date in the *local* zone.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that is the UTC date, so an
 * evening session west of Greenwich would file itself under tomorrow.
 */
export function localDateKey(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const parsed = dateFromKey(value);
  // Rejects 2025-02-31, which the pattern alone would let through.
  return parsed !== null && localDateKey(parsed) === value;
}

/** Local midnight for a date key, or null if it is not one. */
export function dateFromKey(key: string): Date | null {
  if (!DATE_KEY.test(key)) return null;
  const parts = key.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`, both date keys. Negative means earlier. */
export function daysBetween(from: string, to: string): number | null {
  const start = dateFromKey(from);
  const end = dateFromKey(to);
  if (start === null || end === null) return null;
  // Rounded, not floored: a DST boundary makes the difference 23 or 25 hours.
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

// --- Building a session ---------------------------------------------------

export function emptySet(setIndex: number, isWarmup = false): LoggedSet {
  return {
    setIndex,
    weight: null,
    reps: null,
    seconds: null,
    distance: null,
    rir: null,
    isWarmup,
    skipped: false,
    completedAt: null,
    restTakenSeconds: null,
  };
}

function prescribedSets(prescription: Prescription): LoggedSet[] {
  const count = clamp(Math.round(prescription.sets), 1, MAX_SETS);
  return Array.from({ length: count }, (_unused, index) => emptySet(index));
}

/**
 * The entries a workout body starts a session with: one row per slot, in
 * order, with an empty set per prescribed set.
 *
 * Rest rows come across as rows with no sets. They are kept rather than
 * dropped because a circuit's pauses are part of how the workout is performed,
 * and every consumer already excludes them by `kind`.
 */
export function entriesFromBody(body: WorkoutBody): SessionEntry[] {
  return body.slots.map((slot) => ({
    slotId: slot.slotId,
    kind: slot.kind,
    exerciseId: slot.exerciseId,
    exerciseName: slot.exerciseName,
    occurrenceIndex: slot.occurrenceIndex,
    prescription: slot.prescription,
    sets: slot.kind === 'rest' ? [] : prescribedSets(slot.prescription),
    supersetGroup: slot.supersetGroup,
    notes: '',
  }));
}

export type NewSessionInput = {
  sessionId: string;
  workoutId: string | null;
  workoutVersion: number | null;
  workoutName: string;
  body: WorkoutBody | null;
  performedOn?: string;
  startedAt?: string;
};

/** A fresh active session. Pure, so starting one needs no round trip. */
export function newSession(input: NewSessionInput): Session {
  const body = input.body;
  return {
    id: input.sessionId,
    workoutId: input.workoutId,
    workoutVersion: input.workoutVersion,
    workoutName: input.workoutName,
    status: 'active',
    performedOn: input.performedOn ?? localDateKey(),
    startedAt: input.startedAt ?? new Date().toISOString(),
    completedAt: null,
    entries: body === null ? [] : entriesFromBody(body),
    groupRest: body === null ? {} : { ...body.groupRest },
    bodyweight: null,
    notes: '',
  };
}

// --- Editing entries -----------------------------------------------------
// All pure. The screen writes the returned array straight through to the
// session document and re-renders from Firestore's local cache.
//
// There is deliberately no way to add or delete a set here. The workout's
// prescription *is* the plan, and a set count changed mid-session is a change
// to the plan made at the worst possible moment. Skipping is the honest way to
// record doing less, and it keeps the row — so the session still reads as what
// was prescribed, with the gap visible. Changing the prescription itself is
// the workout editor's job.

function mapEntry(
  entries: readonly SessionEntry[],
  key: string,
  change: (entry: SessionEntry) => SessionEntry,
): SessionEntry[] {
  return entries.map((entry) => (entryKey(entry) === key ? change(entry) : entry));
}

export type SetPatch = {
  weight?: Weight | null;
  reps?: number | null;
  seconds?: number | null;
  distance?: Distance | null;
  rir?: number | null;
  isWarmup?: boolean;
  skipped?: boolean;
  completedAt?: string | null;
  restTakenSeconds?: number | null;
};

/** Upper bound on a recorded rest, so a forgotten timer stays out of range. */
const MAX_REST_TAKEN_SECONDS = 7200;

/** The heaviest load, either way: a plate stack, or the most assistance a machine gives. */
export const MAX_LOAD = 2000;

/** Clamps entered numbers, so a fat-fingered 999 cannot poison the stats. */
function normalizeSet(set: LoggedSet): LoggedSet {
  const weight =
    set.weight === null ||
    !Number.isFinite(set.weight.value) ||
    Math.abs(set.weight.value) > MAX_LOAD
      ? null
      : set.weight;
  const distance =
    set.distance === null ||
    !Number.isFinite(set.distance.value) ||
    set.distance.value < 0 ||
    set.distance.value > MAX_DISTANCE
      ? null
      : set.distance;
  return {
    ...set,
    weight,
    reps: set.reps === null ? null : clamp(Math.round(set.reps), 0, MAX_REPS),
    seconds:
      set.seconds === null || !Number.isFinite(set.seconds)
        ? null
        : clamp(Math.round(set.seconds), 0, MAX_SET_SECONDS),
    distance,
    rir: set.rir === null ? null : clamp(Math.round(set.rir), 0, MAX_RIR),
    restTakenSeconds:
      set.restTakenSeconds === null || !Number.isFinite(set.restTakenSeconds)
        ? null
        : clamp(Math.round(set.restTakenSeconds), 0, MAX_REST_TAKEN_SECONDS),
  };
}

export function updateSet(
  entries: readonly SessionEntry[],
  key: string,
  setIndex: number,
  patch: SetPatch,
): SessionEntry[] {
  return mapEntry(entries, key, (entry) => ({
    ...entry,
    sets: entry.sets.map((set) =>
      set.setIndex === setIndex ? normalizeSet({ ...set, ...patch }) : set,
    ),
  }));
}

/**
 * Marks a set done, or undoes that. Clears `skipped` either way.
 *
 * Also clears `restTakenSeconds`: the rest it measured followed a finish that
 * no longer stands. Kept, it made a set ticked again after a mis-tap read as
 * already rested, so its new rest could not be picked up after the app was
 * killed (see `restToResume`).
 */
export function toggleSetComplete(
  entries: readonly SessionEntry[],
  key: string,
  setIndex: number,
  at: string = new Date().toISOString(),
): SessionEntry[] {
  return mapEntry(entries, key, (entry) => ({
    ...entry,
    sets: entry.sets.map((set) =>
      set.setIndex === setIndex
        ? {
            ...set,
            completedAt: set.completedAt === null ? at : null,
            skipped: false,
            restTakenSeconds: null,
          }
        : set,
    ),
  }));
}

/** A skipped set keeps its row, so the workout still reads as prescribed. */
export function toggleSetSkipped(
  entries: readonly SessionEntry[],
  key: string,
  setIndex: number,
): SessionEntry[] {
  return mapEntry(entries, key, (entry) => ({
    ...entry,
    sets: entry.sets.map((set) =>
      set.setIndex === setIndex
        ? { ...set, skipped: !set.skipped, completedAt: set.skipped ? set.completedAt : null }
        : set,
    ),
  }));
}

export function setEntryNotes(
  entries: readonly SessionEntry[],
  key: string,
  notes: string,
): SessionEntry[] {
  return mapEntry(entries, key, (entry) => ({ ...entry, notes }));
}

/** The next free occurrence index for an exercise already in the session. */
export function nextOccurrenceInSession(
  entries: readonly SessionEntry[],
  exerciseId: string,
): number {
  let next = 0;
  for (const entry of entries) {
    if (entry.exerciseId === exerciseId) next = Math.max(next, entry.occurrenceIndex + 1);
  }
  return next;
}

export type AdHocEntryInput = {
  exerciseId: string;
  exerciseName: string;
  prescription?: Prescription;
  sets?: number;
};

/**
 * Adds an exercise that is not in the workout.
 *
 * `slotId` stays null and the occurrence index continues the workout's own
 * numbering, so the row gets its own overlay history under
 * `exerciseId#occurrenceIndex` without colliding with a prescribed row.
 */
export function addAdHocEntry(
  entries: readonly SessionEntry[],
  input: AdHocEntryInput,
): SessionEntry[] {
  const count = clamp(Math.round(input.sets ?? input.prescription?.sets ?? 1), 1, MAX_SETS);
  return [
    ...entries,
    {
      slotId: null,
      kind: 'exercise',
      exerciseId: input.exerciseId,
      exerciseName: input.exerciseName,
      occurrenceIndex: nextOccurrenceInSession(entries, input.exerciseId),
      prescription: input.prescription ?? null,
      sets: Array.from({ length: count }, (_unused, index) => emptySet(index)),
      supersetGroup: null,
      notes: '',
    },
  ];
}

/**
 * Counts an ad-hoc row in another measure. Only before anything is entered on
 * it: switching under logged numbers would leave them in a field nothing reads.
 * A prescribed row's measure is the workout's, changed in the editor.
 */
export function setEntryMeasure(
  entries: readonly SessionEntry[],
  key: string,
  measure: Measure,
  distanceUnit: DistanceUnit = DEFAULT_DISTANCE_UNIT,
): SessionEntry[] {
  return mapEntry(entries, key, (entry) => {
    if (entry.prescription !== null) return entry;
    const rest: SessionEntry = { ...entry };
    delete rest.measure;
    delete rest.distanceUnit;
    if (measure === 'reps') return rest;
    if (measure === 'time') return { ...rest, measure };
    return { ...rest, measure, distanceUnit };
  });
}

/** True once any set of a row holds a number, so its measure is settled. */
export function hasEnteredSets(entry: SessionEntry): boolean {
  return entry.sets.some(
    (set) =>
      set.weight !== null || set.reps !== null || set.seconds !== null || set.distance !== null,
  );
}

/** Removes a row entirely. How an ad-hoc addition is backed out. */
export function removeEntry(entries: readonly SessionEntry[], key: string): SessionEntry[] {
  return entries.filter((entry) => entryKey(entry) !== key);
}

// --- Reading a session ---------------------------------------------------

/** Sets that count as work: not a warmup, not skipped. */
export function workingSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.filter((set) => !set.isWarmup && !set.skipped);
}

/**
 * A set is *performed* once it holds what its measure needs: a load and a rep
 * count, or a time, or a distance (a load being optional for those two).
 * The fields say which measure a set was logged in, so this needs no row.
 */
export function isPerformed(set: LoggedSet): boolean {
  if (set.skipped) return false;
  if (set.seconds !== null || set.distance !== null) return true;
  return set.weight !== null && set.reps !== null;
}

/** Sets that can be compared, ranked, or turned into a PR. */
export function performedSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return workingSets(sets).filter(isPerformed);
}

/**
 * Sets that were *done*, which is a looser bar than sets that can be scored.
 *
 * A set counts here once it has reps in it or was ticked complete, even with
 * no load — a set of pull-ups is work whether or not a number was typed into
 * the weight box. `performedSets` stays stricter because e1RM, deltas and PRs
 * genuinely cannot be computed without a load; but counting sets, and shading
 * a muscle for having been trained, only need to know the set happened.
 */
export function workedSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return workingSets(sets).filter(
    (set) =>
      set.reps !== null ||
      set.seconds !== null ||
      set.distance !== null ||
      set.completedAt !== null,
  );
}

/**
 * Every exercise the session touched, de-duplicated.
 *
 * Denormalised onto the session document so one lift's history is an
 * `array-contains` query rather than a scan of every session ever logged
 * (§2.6: deeper history comes from querying `sessions`, lazily). Occurrence
 * indices are deliberately dropped — the query asks "did this session include
 * bench", and the split into occurrences is the overlay's business.
 */
export function sessionExerciseIds(entries: readonly SessionEntry[]): string[] {
  return [...new Set(exerciseEntries(entries).map((entry) => entry.exerciseId))].sort();
}

/**
 * How a logged set landed: whether it is even usable, and if so how it did
 * against what was prescribed.
 *
 * `incomplete` comes first and matters most. A set with reps but no load — or
 * a load but no reps — cannot be turned into an estimated 1RM, so it is
 * excluded from `performedSets` and therefore never reaches `workoutStats`.
 * That is the quiet failure worth surfacing: the set looks logged, and next
 * week the overlay will act as though it never happened. Flagging it while the
 * session is open is the only moment the missing number can still be supplied.
 *
 * The rest is reps against the prescribed range, and deliberately only reps.
 * The rep range is the part of a prescription you either hit or did not, and it
 * says what to do next: under it means the load was too heavy, over it means
 * too light. Judging the load itself would need a target load, which no
 * prescription carries — a load is compared against *last time*, which is the
 * delta chip's job, not this.
 *
 * `unassessed` covers a row with nothing entered at all, a warmup, a skipped
 * set, and a fully entered ad-hoc set with no prescription to be measured
 * against. None of those can be off-target, and marking an untouched row as
 * missing its rep range would flag every set before it was done.
 */
export type SetAssessment = 'unassessed' | 'incomplete' | 'under' | 'on-target' | 'over';

export function assessSet(
  set: LoggedSet,
  prescription: Prescription | null,
  measure: Measure = measureOf(prescription),
): SetAssessment {
  // A warmup and a skipped set are both excluded from history by design, so
  // neither a missing number nor a missed rep range means anything for them.
  if (set.isWarmup || set.skipped) return 'unassessed';

  // A time or a distance needs only itself; a load beside it is optional. A
  // load with no time or distance is half-entered, as a load with no reps is.
  if (measure !== 'reps') {
    const unit = prescription === null ? DEFAULT_DISTANCE_UNIT : distanceUnitOf(prescription);
    const amount = setAmountIn(set, measure, unit);
    if (amount === null) return set.weight === null ? 'unassessed' : 'incomplete';
    if (prescription === null) return 'unassessed';
    const { min, max } = prescription.repRange;
    if (amount < min) return 'under';
    if (amount > max) return 'over';
    return 'on-target';
  }

  // Untouched. Not a problem, just not started.
  if (set.weight === null && set.reps === null) return 'unassessed';

  // Half-entered: this set will not reach your history (see the type's note).
  if (set.weight === null || set.reps === null) return 'incomplete';

  if (prescription === null) return 'unassessed';

  const { min, max } = prescription.repRange;
  if (set.reps < min) return 'under';
  if (set.reps > max) return 'over';
  return 'on-target';
}

/**
 * True when a working set holds every number its row asks for.
 *
 * A prescribed row asks for RIR as well as load and reps. A warmup and a
 * skipped set never qualify.
 */
export function isFullyEntered(
  set: LoggedSet,
  prescription: Prescription | null,
  measure: Measure = measureOf(prescription),
): boolean {
  if (set.isWarmup || set.skipped) return false;
  if (measure === 'reps') {
    if (set.weight === null || set.reps === null) return false;
  } else if (setAmount(set, measure) === null) {
    return false;
  }
  return prescription === null || set.rir !== null;
}

/** Reps above this read as a load typed into the reps box. */
export const IMPLAUSIBLE_REPS = 30;

/** A load below this, per unit, reads as a rep count typed into the load box. */
export const IMPLAUSIBLE_WEIGHT: Record<Unit, number> = { lb: 25, kg: 12 };

/** Reps this many times the prescribed maximum also read as a load. */
export const IMPLAUSIBLE_REP_FACTOR = 3;

/**
 * True when a set's load and reps look swapped.
 *
 * Both halves have to be wrong at once: a load too small to be one *and* more
 * reps than the absolute threshold or than the prescription can explain. A
 * load of zero is bodyweight and a negative one is assistance, both entered
 * on purpose. A time or distance set has no reps to swap.
 */
export function looksTransposed(set: LoggedSet, prescription: Prescription | null = null): boolean {
  const { weight, reps } = set;
  if (weight === null || reps === null || weight.value <= 0) return false;
  if (weight.value >= IMPLAUSIBLE_WEIGHT[weight.unit] || weight.value >= reps) return false;
  if (reps > IMPLAUSIBLE_REPS) return true;
  return prescription !== null && reps > prescription.repRange.max * IMPLAUSIBLE_REP_FACTOR;
}

/**
 * The number a half-entered set is missing, for the on-screen note. Only a
 * reps set can miss its load: a time or distance stands on its own.
 */
export function missingField(set: LoggedSet, measure: Measure = 'reps'): 'weight' | 'reps' | null {
  if (measure !== 'reps') return null;
  if (set.weight === null && set.reps !== null) return 'weight';
  if (set.reps === null && set.weight !== null) return 'reps';
  return null;
}

export type SessionProgress = { completed: number; total: number };

/**
 * How far through the session you are, counting set rows.
 *
 * A skipped set counts as dealt with rather than outstanding — otherwise a
 * session you deliberately cut short could never read as finished.
 */
export function sessionProgress(entries: readonly SessionEntry[]): SessionProgress {
  let completed = 0;
  let total = 0;
  for (const entry of exerciseEntries(entries)) {
    for (const set of entry.sets) {
      total += 1;
      if (set.completedAt !== null || set.skipped) completed += 1;
    }
  }
  return { completed, total };
}

/** True once every prescribed set has been completed or skipped. */
export function isSessionFinished(entries: readonly SessionEntry[]): boolean {
  const { completed, total } = sessionProgress(entries);
  return total > 0 && completed === total;
}

/** Sets actually performed, for a session-level readout. */
export function totalPerformedSets(entries: readonly SessionEntry[]): number {
  return exerciseEntries(entries).reduce((sum, entry) => sum + performedSets(entry.sets).length, 0);
}

/**
 * Whether a row is the last member of its circuit.
 *
 * That is the moment the *round* rest applies rather than the member's own:
 * you have come back round to the top of the circuit. A row in no circuit is
 * trivially the last of its own round.
 */
export function isLastOfRound(entries: readonly SessionEntry[], key: string): boolean {
  const entry = entries.find((candidate) => entryKey(candidate) === key);
  if (entry === undefined) return true;
  if (entry.supersetGroup === null) return true;

  const members = entries.filter((candidate) => candidate.supersetGroup === entry.supersetGroup);
  return entryKey(members[members.length - 1] ?? entry) === key;
}

export type SetRef = { entryKey: string; setIndex: number };

/**
 * The next set still to do, in reading order from a starting point.
 *
 * Used for "what is next" on the rest timer, so the notification that arrives
 * with the screen off says which exercise to walk to. Search starts *at* the
 * row just finished — a circuit member with sets left is still the next thing
 * once you have come back round — and wraps to the top, because sets are often
 * filled in out of order and the one you skipped past is still outstanding.
 */
export function nextUnfinishedSet(
  entries: readonly SessionEntry[],
  fromKey: string | null = null,
): SetRef | null {
  const rows = exerciseEntries(entries);
  const start = fromKey === null ? 0 : rows.findIndex((entry) => entryKey(entry) === fromKey);
  const offset = start === -1 ? 0 : start;

  for (let step = 0; step < rows.length; step += 1) {
    const entry = rows[(offset + step) % rows.length];
    if (entry === undefined) continue;
    const pending = entry.sets.find((set) => set.completedAt === null && !set.skipped);
    if (pending !== undefined) return { entryKey: entryKey(entry), setIndex: pending.setIndex };
  }
  return null;
}

/** The row a set reference points at. */
export function entryFor(entries: readonly SessionEntry[], key: string): SessionEntry | null {
  return entries.find((entry) => entryKey(entry) === key) ?? null;
}

/** Elapsed seconds of an in-progress or finished session. */
export function sessionSeconds(session: Session, now: Date = new Date()): number | null {
  if (session.startedAt === null) return null;
  const start = Date.parse(session.startedAt);
  if (Number.isNaN(start)) return null;

  const end = session.completedAt === null ? now.getTime() : Date.parse(session.completedAt);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 1000));
}

/**
 * Enough to say the set happened.
 *
 * A rep count (or a time, or a distance), and nothing less. Reps are the
 * irreducible fact of a performed set — a load without them says the bar was loaded, not that
 * anything was lifted — so a row with reps in it was done, whatever else is
 * missing, and a row without them was not.
 */
function wasPerformed(set: LoggedSet): boolean {
  return set.reps !== null || set.seconds !== null || set.distance !== null;
}

function isOutstanding(set: LoggedSet): boolean {
  return set.completedAt === null && !set.skipped;
}

export type Outstanding = {
  exerciseName: string;
  /** Outstanding sets that have reps in them, so they were done. */
  toComplete: number;
  /** Outstanding sets with nothing entered. */
  toSkip: number;
};

/**
 * What has not been dealt with yet, split by what should happen to it.
 *
 * Drives the confirmation shown when a session is finished early. Naming the
 * exercises is the difference between "3 sets left" and knowing they are all
 * the last exercise you meant to drop anyway — and splitting them is the
 * difference between skipping work you actually did and recording it.
 */
export function outstandingSets(entries: readonly SessionEntry[]): Outstanding[] {
  const outstanding: Outstanding[] = [];

  for (const entry of exerciseEntries(entries)) {
    const pending = entry.sets.filter(isOutstanding);
    const toComplete = pending.filter(wasPerformed).length;
    const toSkip = pending.length - toComplete;
    if (pending.length > 0) {
      outstanding.push({ exerciseName: entry.exerciseName, toComplete, toSkip });
    }
  }
  return outstanding;
}

export type MissingNumbers = {
  exerciseName: string;
  /** How many of its sets are short of a number. */
  count: number;
  /** The first of them, to scroll to. */
  first: { entryKey: string; setIndex: number };
};

/**
 * Sets that count as done but are short of a number their row asks for:
 * ticked with nothing in them, or with reps and no load, or no RIR on a
 * prescribed row. The same rule that ticks a set by itself
 * (`isFullyEntered`).
 *
 * A set counts as done when it is ticked, or when it has reps in it and
 * finishing would tick it (see `settleOutstandingSets`). Finishing is held
 * until these are filled in or skipped, so nothing half-entered reaches your
 * history. Skipped sets, warmups and untouched unticked sets (which finishing
 * skips) are left alone.
 */
export function setsMissingNumbers(entries: readonly SessionEntry[]): MissingNumbers[] {
  const missing: MissingNumbers[] = [];

  for (const entry of exerciseEntries(entries)) {
    const measure = entryMeasure(entry);
    const short = entry.sets.filter(
      (set) =>
        !set.skipped &&
        !set.isWarmup &&
        (set.completedAt !== null || wasPerformed(set)) &&
        !isFullyEntered(set, entry.prescription, measure),
    );
    const [first] = short;
    if (first !== undefined) {
      missing.push({
        exerciseName: entry.exerciseName,
        count: short.length,
        first: { entryKey: entryKey(entry), setIndex: first.setIndex },
      });
    }
  }
  return missing;
}

export type Settlement = {
  entries: SessionEntry[];
  /** How many were ticked because they had reps in them. */
  completed: number;
  /** How many were skipped because nothing was entered. */
  skipped: number;
};

/**
 * Settles everything still outstanding, so finishing early records the truth.
 *
 * Two different things get two different treatments, because they mean two
 * different things:
 *
 * - **Reps entered but not ticked** is a forgotten tap, not a set you did not
 *   do. Skipping it would drop real work out of `workingSets`, so it would
 *   never reach `workoutStats`, and next week's overlay would compare against
 *   the set before it as though this one never happened. It is marked **done**.
 * - **Nothing entered** is work not done. It is marked **skipped**, which
 *   keeps the row — so the session still reads as what was prescribed, with
 *   the gap visible — and feeds no stats, so the overlay falls back to the
 *   last set actually performed.
 */
export function settleOutstandingSets(
  entries: readonly SessionEntry[],
  at: string = new Date().toISOString(),
): Settlement {
  let completed = 0;
  let skipped = 0;

  const settled = entries.map((entry) => {
    if (entry.kind === 'rest') return entry;

    return {
      ...entry,
      sets: entry.sets.map((set) => {
        if (!isOutstanding(set)) return set;
        if (wasPerformed(set)) {
          completed += 1;
          return { ...set, completedAt: at };
        }
        skipped += 1;
        return { ...set, skipped: true };
      }),
    };
  });

  return { entries: settled, completed, skipped };
}

export type CompletedSet = { entryKey: string; setIndex: number; completedAt: string };

/**
 * The set completed most recently, by the time it was ticked.
 *
 * This is what a rest timer falls back to when the set that started it is
 * un-ticked: the rest that the *previous* set earned is still owed, and it
 * started when that set was finished — not now. Ordered by `completedAt`
 * rather than by position, because sets get filled in out of order.
 */
export function lastCompletedSet(entries: readonly SessionEntry[]): CompletedSet | null {
  let latest: CompletedSet | null = null;

  for (const entry of exerciseEntries(entries)) {
    for (const set of entry.sets) {
      const at = set.completedAt;
      if (at === null || set.skipped) continue;
      if (latest === null || at > latest.completedAt) {
        latest = { entryKey: entryKey(entry), setIndex: set.setIndex, completedAt: at };
      }
    }
  }
  return latest;
}

/**
 * The rest to run after a set, in seconds.
 *
 * A circuit has two rests and this picks between them: a member's own rest
 * normally runs between exercises of a round, and the group's round rest runs
 * after the last member instead. Neither being set falls back to the profile
 * default, which is what a null in either place means.
 */
export function restAfter(
  session: Session,
  entry: SessionEntry,
  defaultRestSeconds: number,
  isLastOfRound = false,
): number {
  if (entry.supersetGroup !== null && isLastOfRound) {
    return session.groupRest[entry.supersetGroup] ?? defaultRestSeconds;
  }
  return entry.prescription?.restSeconds ?? defaultRestSeconds;
}

// --- Parsing untrusted session documents ---------------------------------
// Kept in the domain so it is testable without Firestore. The data layer only
// converts Timestamps to ISO strings before handing values over.

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asIsoOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

export function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value);
}

/**
 * A stored weight, or null when either half is unusable. Never negative: this
 * reads bodyweight, which has no assisted reading. A set's load is `parseLoad`.
 */
export function parseWeight(value: unknown): Weight | null {
  const weight = parseLoad(value);
  return weight === null || weight.value < 0 ? null : weight;
}

/** A set's stored load, which may be negative (assistance). */
export function parseLoad(value: unknown): Weight | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const amount: unknown = record['value'];
  const unit: unknown = record['unit'];
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  if (unit !== 'lb' && unit !== 'kg') return null;
  const parsed: Unit = unit;
  return { value: amount, unit: parsed };
}

function parseDistance(value: unknown): Distance | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const amount: unknown = record['value'];
  const unit: unknown = record['unit'];
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  return isDistanceUnit(unit) ? { value: amount, unit } : null;
}

export function parseLoggedSet(value: unknown, index: number): LoggedSet {
  if (typeof value !== 'object' || value === null) return emptySet(index);
  const record = value as Record<string, unknown>;
  const reps: unknown = record['reps'];
  const seconds: unknown = record['seconds'];
  const rir: unknown = record['rir'];
  const restTaken: unknown = record['restTakenSeconds'];

  return normalizeSet({
    // Position wins over the stored index: the array order is what the user
    // sees, and a stale index would line the overlay up against the wrong set.
    setIndex: index,
    weight: parseLoad(record['weight']),
    reps: typeof reps === 'number' && Number.isFinite(reps) ? reps : null,
    seconds: typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : null,
    distance: parseDistance(record['distance']),
    rir: typeof rir === 'number' && Number.isFinite(rir) ? rir : null,
    isWarmup: record['isWarmup'] === true,
    skipped: record['skipped'] === true,
    completedAt: asIsoOrNull(record['completedAt']),
    restTakenSeconds: typeof restTaken === 'number' ? restTaken : null,
  });
}

export function parseLoggedSets(value: unknown): LoggedSet[] {
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).map((raw, index) => parseLoggedSet(raw, index));
}

/** Returns null for a row with no exercise identity, so it is dropped. */
export function parseSessionEntry(value: unknown): SessionEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const exerciseId = asString(record['exerciseId']);
  if (exerciseId === '') return null;

  const slotId: unknown = record['slotId'];
  const superset: unknown = record['supersetGroup'];
  const prescription: unknown = record['prescription'];
  const kind: SlotKind = record['kind'] === 'rest' ? 'rest' : 'exercise';
  const measure: unknown = record['measure'];
  const unit: unknown = record['distanceUnit'];

  return {
    slotId: typeof slotId === 'string' && slotId !== '' ? slotId : null,
    kind,
    exerciseId,
    exerciseName: asString(record['exerciseName'], kind === 'rest' ? 'Rest' : exerciseId),
    occurrenceIndex: Math.max(0, Math.round(asNumber(record['occurrenceIndex'], 0))),
    // An ad-hoc row legitimately has none, so a missing prescription stays
    // null rather than being defaulted into one nobody wrote.
    prescription:
      prescription === null || prescription === undefined ? null : parsePrescription(prescription),
    sets: kind === 'rest' ? [] : parseLoggedSets(record['sets']),
    supersetGroup: typeof superset === 'string' && superset !== '' ? superset : null,
    notes: asString(record['notes']),
    ...(isMeasure(measure) && measure !== 'reps' ? { measure } : {}),
    ...(isDistanceUnit(unit) && measure === 'distance' ? { distanceUnit: unit } : {}),
  };
}

export function parseSessionEntries(value: unknown): SessionEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: SessionEntry[] = [];
  for (const raw of value as readonly unknown[]) {
    const entry = parseSessionEntry(raw);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/**
 * A whole session document.
 *
 * Timestamp fields arrive as ISO strings — the data layer converts them first
 * — so this stays a pure function over plain data and is testable without
 * Firestore.
 */
export function parseSession(id: string, record: Record<string, unknown>): Session {
  const workoutId: unknown = record['workoutId'];
  const version: unknown = record['workoutVersion'];
  const performedOn: unknown = record['performedOn'];
  const status: unknown = record['status'];

  return {
    id,
    workoutId: typeof workoutId === 'string' && workoutId !== '' ? workoutId : null,
    workoutVersion:
      typeof version === 'number' && Number.isFinite(version) ? Math.round(version) : null,
    workoutName: asString(record['workoutName'], 'Ad-hoc session'),
    // An unrecognised status is treated as abandoned rather than active, so a
    // corrupt document can never present itself as the session to resume.
    status: isSessionStatus(status) ? status : 'abandoned',
    performedOn: isDateKey(performedOn) ? performedOn : localDateKey(),
    startedAt: asIsoOrNull(record['startedAt']),
    completedAt: asIsoOrNull(record['completedAt']),
    entries: parseSessionEntries(record['entries']),
    groupRest: parseGroupRest(record['groupRest']),
    bodyweight: parseWeight(record['bodyweight']),
    notes: asString(record['notes']),
  };
}
