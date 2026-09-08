import type { LoggedSet, Session, SessionEntry } from './sessions';
import {
  exerciseEntries,
  isDateKey,
  parseLoggedSet,
  parseLoggedSets,
  performedSets,
  workingSets,
} from './sessions';
import { adjustedE1rm, beatsRecord, bestSet } from './strength';
import type { Prescription } from './workouts';
import { occurrenceKey, parsePrescription } from './workouts';

/**
 * The previous-performance overlay, in two tiers (§2.6).
 *
 * **The problem.** Bench press appears on PUSH and again on CHEST + DELTS.
 * Bench on PUSH is done fresh; bench on CHEST day is done alongside different
 * work at different loads. Overlaying "the last time you benched anywhere"
 * would compare the two and produce a meaningless delta. So:
 *
 * - **Tier 1, same workout.** `workoutStats/{workoutId}` keyed by
 *   `exerciseId#occurrenceIndex`: the last time you did this lift on this day
 *   type. Shown prominently. Deltas and PRs are computed against this and
 *   nothing else.
 * - **Tier 2, anywhere.** `exerciseStats/{exerciseId}`, shown subordinate and
 *   labelled with the workout it came from. A useful hint at what to load, and
 *   explicitly *not* a progression comparison — no delta chip.
 * - **Tier 3, NEW.** Neither exists. That is the whole new-exercise rule; no
 *   separate bookkeeping.
 *
 * Both tiers are plain document reads keyed by id, so opening a session
 * populates the whole overlay from one document plus a read per unmatched
 * exercise — and rendering it never touches the network.
 */

/** One past performance of one exercise, denormalised into a stats document. */
export type LastPerformance = {
  sessionId: string;
  performedOn: string;
  /** Null when the performance was an ad-hoc session. */
  workoutId: string | null;
  workoutName: string;
  prescription: Prescription | null;
  sets: LoggedSet[];
};

/**
 * Tier 1: the last performance of every exercise *within one workout*.
 *
 * One document per workout, holding every exercise in it. That is the whole
 * point: open a session, read one document, the overlay is populated. Around
 * fifteen exercises with a handful of sets each sits far under the 1 MB limit.
 */
export type WorkoutStats = {
  workoutId: string;
  workoutName: string;
  lastSessionId: string;
  lastPerformedOn: string;
  /** Keyed by `exerciseId#occurrenceIndex`. */
  byOccurrence: Record<string, LastPerformance>;
};

/** Tier 2 plus the PR record: the last performance of one exercise anywhere. */
export type ExerciseStats = {
  exerciseId: string;
  lastSessionId: string;
  lastPerformedOn: string;
  /** So the UI can label the fallback honestly: "last done on PUSH". */
  lastWorkoutId: string | null;
  lastWorkoutName: string;
  lastPrescription: Prescription | null;
  lastSets: LoggedSet[];
  /** Best adjusted e1RM ever, in kilograms — the single internal unit. */
  bestE1rm: number;
  bestE1rmAt: string | null;
  bestE1rmSessionId: string | null;
  /** The set that produced the record, so the UI can show the real numbers. */
  bestSet: LoggedSet | null;
  totalSessions: number;
};

export type Overlay =
  | { kind: 'same-workout'; data: LastPerformance }
  | { kind: 'other-workout'; data: LastPerformance }
  | { kind: 'new' };

/**
 * What the overlay needs to identify a row. Both an `ExerciseSlot` and a
 * `SessionEntry` satisfy it, so the same resolution serves the workout editor
 * and an ad-hoc row that belongs to no slot.
 */
export type OverlayTarget = {
  exerciseId: string;
  occurrenceIndex: number;
};

/**
 * Resolves the overlay for one row. Pure, synchronous, and the only place the
 * tier order is decided.
 */
export function resolveOverlay(
  target: OverlayTarget,
  workoutStats: WorkoutStats | null,
  exerciseStats: ExerciseStats | null,
): Overlay {
  const key = occurrenceKey(target.exerciseId, target.occurrenceIndex);
  const sameWorkout = workoutStats?.byOccurrence[key];
  if (sameWorkout !== undefined && workingSets(sameWorkout.sets).length > 0) {
    return { kind: 'same-workout', data: sameWorkout };
  }

  if (exerciseStats !== null && workingSets(exerciseStats.lastSets).length > 0) {
    return {
      kind: 'other-workout',
      data: {
        sessionId: exerciseStats.lastSessionId,
        performedOn: exerciseStats.lastPerformedOn,
        workoutId: exerciseStats.lastWorkoutId,
        workoutName: exerciseStats.lastWorkoutName,
        prescription: exerciseStats.lastPrescription,
        sets: exerciseStats.lastSets,
      },
    };
  }

  return { kind: 'new' };
}

/**
 * Only tier 1 earns a delta.
 *
 * Tier 2 is a different day type under different fatigue, so a delta against
 * it would be a number that looks like progression and is not one.
 */
export function isComparable(
  overlay: Overlay,
): overlay is { kind: 'same-workout'; data: LastPerformance } {
  return overlay.kind === 'same-workout';
}

/**
 * The set to line a row up against: same position among the *worked* sets.
 *
 * Warmups are filtered from both sides first, so adding a warmup this week
 * does not shift every comparison down a row. A row past the end of last
 * time's sets — a fourth set where there were three — gets no comparison
 * rather than being compared to the third.
 */
export function previousSetAt(performance: LastPerformance, position: number): LoggedSet | null {
  return workingSets(performance.sets)[position] ?? null;
}

/** The worked position of a set within its entry, or null for a warmup. */
export function workedPosition(entry: SessionEntry, setIndex: number): number | null {
  const position = workingSets(entry.sets).findIndex((set) => set.setIndex === setIndex);
  return position === -1 ? null : position;
}

// --- What completing a session writes ------------------------------------

export type PersonalRecord = {
  exerciseId: string;
  exerciseName: string;
  set: LoggedSet;
  /** Adjusted e1RM in kg. */
  e1rmKg: number;
  /** The record it beat; 0 when there was none. */
  previousE1rmKg: number;
};

export type StatsUpdate = {
  /** Null for an ad-hoc session: no workout, so no tier-1 history to write. */
  workoutStats: WorkoutStats | null;
  /** Keyed by exercise id, already merged with the previous document. */
  exerciseStats: Map<string, ExerciseStats>;
  prs: PersonalRecord[];
};

function toPerformance(session: Session, entry: SessionEntry): LastPerformance {
  return {
    sessionId: session.id,
    performedOn: session.performedOn,
    workoutId: session.workoutId,
    workoutName: session.workoutName,
    prescription: entry.prescription,
    // Warmups are stripped here rather than at read time, so every consumer of
    // a stats document sees only sets that are meant to be compared.
    sets: workingSets(entry.sets),
  };
}

/**
 * The whole denormalised overlay update for a completed session, as a pure
 * function of the session plus whatever the previous documents held.
 *
 * `previous` is passed in rather than read back, which is what lets completion
 * be one offline-safe batch (§2.8): the active-session screen is already
 * subscribed to these documents for the tier-2 fallback, so the values are in
 * the local cache before the button is pressed.
 *
 * Tier 1 is **overwritten**, not merged: it is "the last performance", and an
 * exercise dropped from the workout should stop overlaying. Tier 2 is merged,
 * because `bestE1rm` is a running maximum and `totalSessions` a running count.
 */
export function buildStatsUpdate(
  session: Session,
  previous: (exerciseId: string) => ExerciseStats | null,
): StatsUpdate {
  const performed = exerciseEntries(session.entries).filter(
    (entry) => performedSets(entry.sets).length > 0,
  );

  const byOccurrence: Record<string, LastPerformance> = {};
  const exerciseStats = new Map<string, ExerciseStats>();
  const prs: PersonalRecord[] = [];

  for (const entry of performed) {
    const performance = toPerformance(session, entry);
    byOccurrence[occurrenceKey(entry.exerciseId, entry.occurrenceIndex)] = performance;

    const best = bestSet(entry.sets);
    const bestScore = best === null ? 0 : (adjustedE1rm(best) ?? 0);

    // An exercise can appear twice in one workout, so the tier-2 document may
    // be touched twice in this loop. The in-progress value wins over the
    // stored one, which keeps the two occurrences' bests accumulating.
    const before = exerciseStats.get(entry.exerciseId) ?? previous(entry.exerciseId);
    const previousBest = before?.bestE1rm ?? 0;
    const isRecord = beatsRecord(bestScore, previousBest);

    if (isRecord && best !== null) {
      prs.push({
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        set: best,
        e1rmKg: bestScore,
        previousE1rmKg: previousBest,
      });
    }

    exerciseStats.set(entry.exerciseId, {
      exerciseId: entry.exerciseId,
      lastSessionId: session.id,
      lastPerformedOn: session.performedOn,
      lastWorkoutId: session.workoutId,
      lastWorkoutName: session.workoutName,
      lastPrescription: entry.prescription,
      lastSets: performance.sets,
      bestE1rm: isRecord ? bestScore : previousBest,
      bestE1rmAt: isRecord ? session.performedOn : (before?.bestE1rmAt ?? null),
      bestE1rmSessionId: isRecord ? session.id : (before?.bestE1rmSessionId ?? null),
      bestSet: isRecord ? best : (before?.bestSet ?? null),
      // Counted per exercise, not per entry: benching twice in one session is
      // still one session of bench press, and completing the same session
      // twice must not count it twice either.
      totalSessions:
        before === null
          ? 1
          : before.lastSessionId === session.id
            ? before.totalSessions
            : before.totalSessions + 1,
    });
  }

  const workoutId = session.workoutId;
  return {
    workoutStats:
      workoutId === null
        ? null
        : {
            workoutId,
            workoutName: session.workoutName,
            lastSessionId: session.id,
            lastPerformedOn: session.performedOn,
            byOccurrence,
          },
    exerciseStats,
    prs,
  };
}

// --- Parsing untrusted stats documents -----------------------------------

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asIdOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function parsePerformance(value: unknown): LastPerformance | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const prescription: unknown = record['prescription'];

  const performance: LastPerformance = {
    sessionId: asString(record['sessionId']),
    performedOn: isDateKey(record['performedOn']) ? record['performedOn'] : '',
    workoutId: asIdOrNull(record['workoutId']),
    workoutName: asString(record['workoutName']),
    prescription:
      prescription === null || prescription === undefined ? null : parsePrescription(prescription),
    sets: parseLoggedSets(record['sets']),
  };

  // A performance with no sets overlays nothing, so it is dropped rather than
  // kept as an entry that would shadow the tier-2 fallback.
  return performance.sets.length === 0 ? null : performance;
}

export function parseWorkoutStats(id: string, record: Record<string, unknown>): WorkoutStats {
  const raw: unknown = record['byOccurrence'];
  const byOccurrence: Record<string, LastPerformance> = {};

  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const performance = parsePerformance(value);
      if (performance !== null) byOccurrence[key] = performance;
    }
  }

  return {
    workoutId: asString(record['workoutId'], id),
    workoutName: asString(record['workoutName']),
    lastSessionId: asString(record['lastSessionId']),
    lastPerformedOn: isDateKey(record['lastPerformedOn']) ? record['lastPerformedOn'] : '',
    byOccurrence,
  };
}

export function parseExerciseStats(id: string, record: Record<string, unknown>): ExerciseStats {
  const prescription: unknown = record['lastPrescription'];
  const best: unknown = record['bestSet'];
  const bestAt: unknown = record['bestE1rmAt'];

  return {
    exerciseId: asString(record['exerciseId'], id),
    lastSessionId: asString(record['lastSessionId']),
    lastPerformedOn: isDateKey(record['lastPerformedOn']) ? record['lastPerformedOn'] : '',
    lastWorkoutId: asIdOrNull(record['lastWorkoutId']),
    lastWorkoutName: asString(record['lastWorkoutName']),
    lastPrescription:
      prescription === null || prescription === undefined ? null : parsePrescription(prescription),
    lastSets: parseLoggedSets(record['lastSets']),
    bestE1rm: Math.max(0, asNumber(record['bestE1rm'], 0)),
    bestE1rmAt: isDateKey(bestAt) ? bestAt : null,
    bestE1rmSessionId: asIdOrNull(record['bestE1rmSessionId']),
    bestSet:
      best === null || best === undefined
        ? null
        : parseLoggedSet(best, asNumber((best as Record<string, unknown>)['setIndex'], 0)),
    totalSessions: Math.max(0, Math.round(asNumber(record['totalSessions'], 0))),
  };
}
