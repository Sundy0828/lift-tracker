import type { Unit, Weight } from './types';
import type { Prescription, SlotKind, WorkoutBody } from './workouts';
import {
  MAX_REPS,
  MAX_RIR,
  MAX_SETS,
  clamp,
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
  weight: Weight | null;
  reps: number | null;
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
    rir: null,
    isWarmup,
    skipped: false,
    completedAt: null,
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

function mapEntry(
  entries: readonly SessionEntry[],
  key: string,
  change: (entry: SessionEntry) => SessionEntry,
): SessionEntry[] {
  return entries.map((entry) => (entryKey(entry) === key ? change(entry) : entry));
}

/** Renumbers `setIndex` to match array position, which the helpers rely on. */
function renumber(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.map((set, index) => (set.setIndex === index ? set : { ...set, setIndex: index }));
}

export type SetPatch = {
  weight?: Weight | null;
  reps?: number | null;
  rir?: number | null;
  isWarmup?: boolean;
  skipped?: boolean;
  completedAt?: string | null;
};

/** Clamps entered numbers, so a fat-fingered 999 cannot poison the stats. */
function normalizeSet(set: LoggedSet): LoggedSet {
  const weight =
    set.weight === null || !Number.isFinite(set.weight.value) || set.weight.value < 0
      ? null
      : set.weight;
  return {
    ...set,
    weight,
    reps: set.reps === null ? null : clamp(Math.round(set.reps), 0, MAX_REPS),
    rir: set.rir === null ? null : clamp(Math.round(set.rir), 0, MAX_RIR),
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
 * Appends a set, carrying the last worked set's load forward.
 *
 * A set added mid-workout is nearly always another set of the same thing, so
 * prefilling the load saves the taps that matter most; it is a starting point
 * and is meant to be corrected.
 */
export function addSet(entries: readonly SessionEntry[], key: string): SessionEntry[] {
  return mapEntry(entries, key, (entry) => {
    if (entry.kind === 'rest') return entry;
    const template = [...entry.sets].reverse().find((set) => !set.isWarmup && !set.skipped);
    const next: LoggedSet = {
      ...emptySet(entry.sets.length),
      ...(template === undefined ? {} : { weight: template.weight, reps: template.reps }),
    };
    return { ...entry, sets: [...entry.sets, next] };
  });
}

/** Drops a set. The last one stays: a row with no sets cannot be logged. */
export function removeSet(
  entries: readonly SessionEntry[],
  key: string,
  setIndex: number,
): SessionEntry[] {
  return mapEntry(entries, key, (entry) => {
    if (entry.sets.length <= 1) return entry;
    return { ...entry, sets: renumber(entry.sets.filter((set) => set.setIndex !== setIndex)) };
  });
}

/**
 * Marks a set done, or undoes that.
 *
 * Completing a set is what starts the rest timer, so it is one explicit toggle
 * rather than something inferred from the inputs having been filled in — the
 * timer must not start while you are still typing the weight.
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
        ? { ...set, completedAt: set.completedAt === null ? at : null, skipped: false }
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

/** Removes a row entirely. How an ad-hoc addition is backed out. */
export function removeEntry(entries: readonly SessionEntry[], key: string): SessionEntry[] {
  return entries.filter((entry) => entryKey(entry) !== key);
}

// --- Reading a session ---------------------------------------------------

/** Sets that count as work: not a warmup, not skipped. */
export function workingSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.filter((set) => !set.isWarmup && !set.skipped);
}

/** A set is *performed* once it has both a load and a rep count. */
export function isPerformed(set: LoggedSet): boolean {
  return !set.skipped && set.weight !== null && set.reps !== null;
}

/** Sets that can be compared, ranked, or turned into a PR. */
export function performedSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return workingSets(sets).filter(isPerformed);
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

/** A stored weight, or null when either half is unusable. */
export function parseWeight(value: unknown): Weight | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const amount: unknown = record['value'];
  const unit: unknown = record['unit'];
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  if (unit !== 'lb' && unit !== 'kg') return null;
  const parsed: Unit = unit;
  return { value: amount, unit: parsed };
}

export function parseLoggedSet(value: unknown, index: number): LoggedSet {
  if (typeof value !== 'object' || value === null) return emptySet(index);
  const record = value as Record<string, unknown>;
  const reps: unknown = record['reps'];
  const rir: unknown = record['rir'];

  return normalizeSet({
    // Position wins over the stored index: the array order is what the user
    // sees, and a stale index would line the overlay up against the wrong set.
    setIndex: index,
    weight: parseWeight(record['weight']),
    reps: typeof reps === 'number' && Number.isFinite(reps) ? reps : null,
    rir: typeof rir === 'number' && Number.isFinite(rir) ? rir : null,
    isWarmup: record['isWarmup'] === true,
    skipped: record['skipped'] === true,
    completedAt: asIsoOrNull(record['completedAt']),
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
