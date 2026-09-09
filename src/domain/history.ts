import type { LoggedSet, Session, SessionEntry } from './sessions';
import {
  dateFromKey,
  exerciseEntries,
  localDateKey,
  performedSets,
  sessionSeconds,
  workedSets,
} from './sessions';
import { adjustedE1rm, beatsRecord, loadKg } from './strength';
import type { Unit } from './types';
import { formatNumber, fromKg } from './units';

/**
 * History: reading sessions back.
 *
 * Everything here is a pure function over sessions that have already been
 * fetched. Nothing in this module knows how they were queried, which is what
 * lets the same functions serve the timeline, one exercise's history, and the
 * weekly muscle map.
 *
 * **The calendar key is `performedOn`, never `startedAt`.** A session begun at
 * 11pm and finished after midnight belongs to the night it was done, and one
 * entered the next morning belongs to the day it says it does — that is the
 * whole reason `performedOn` is stamped locally and stays editable.
 */

// --- Weeks ---------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** A date key shifted by whole days, staying in the local zone. */
export function addDays(dateKey: string, days: number): string | null {
  const date = dateFromKey(dateKey);
  if (date === null) return null;
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/**
 * The Monday of the week a date falls in, as a date key.
 *
 * The Monday key *is* the week key: it sorts lexicographically alongside every
 * other date key, it renders without a lookup, and it sidesteps ISO week
 * numbering entirely — `2027-W53` and the year-boundary rules behind it are a
 * known source of off-by-one bugs and buy nothing here, since no screen shows
 * a week number.
 */
export function weekStartOf(dateKey: string): string | null {
  const date = dateFromKey(dateKey);
  if (date === null) return null;
  // getDay() is Sunday-based; shift so Monday is 0.
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDateKey(date);
}

/** The Sunday closing the week that starts on `weekStart`. */
export function weekEndOf(weekStart: string): string | null {
  return addDays(weekStart, 6);
}

/** Whole weeks between two week starts. Negative means earlier. */
export function weeksBetween(from: string, to: string): number | null {
  const start = dateFromKey(from);
  const end = dateFromKey(to);
  if (start === null || end === null) return null;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY / 7);
}

// --- Session totals ------------------------------------------------------

/**
 * Tonnage: load times reps, summed over every set that can be scored.
 *
 * Strictly `performedSets` — a set needs both a load and a rep count to
 * contribute, so a bodyweight row with reps and no load adds nothing here.
 * That is why tonnage is shown *alongside* the set count rather than instead
 * of it: the set count is the honest number on a bodyweight day.
 */
export function volumeLoadKg(sets: readonly LoggedSet[]): number {
  let total = 0;
  for (const set of performedSets(sets)) {
    const kilograms = loadKg(set);
    if (kilograms === null || set.reps === null) continue;
    total += kilograms * set.reps;
  }
  return total;
}

/**
 * How long a session took, or null if it never finished.
 *
 * Guarded on `completedAt` rather than delegating straight to
 * `sessionSeconds`, which measures against *now* for an open session — right
 * on the active-session clock, and badly wrong in history, where a session
 * abandoned by a crash last March would report four months of lifting.
 */
export function sessionDurationSeconds(session: Session): number | null {
  return session.completedAt === null ? null : sessionSeconds(session);
}

export type SessionTotals = {
  /** Sets that were actually done — the looser count (see `workedSets`). */
  sets: number;
  /** Distinct exercise rows with at least one set done. */
  exercises: number;
  volumeLoadKg: number;
};

export function sessionTotals(session: Session): SessionTotals {
  let sets = 0;
  let exercises = 0;
  let load = 0;

  for (const entry of exerciseEntries(session.entries)) {
    const done = workedSets(entry.sets);
    if (done.length === 0) continue;
    sets += done.length;
    exercises += 1;
    load += volumeLoadKg(entry.sets);
  }
  return { sets, exercises, volumeLoadKg: load };
}

export type WeekTotals = SessionTotals & { sessions: number };

export type WeekGroup = {
  /** Monday's date key — the group's identity and its sort order. */
  weekStart: string;
  weekEnd: string;
  /** Newest first, matching the order the timeline renders. */
  sessions: Session[];
  totals: WeekTotals;
};

/**
 * Sessions bucketed into weeks, newest week first and newest session first
 * within a week.
 *
 * A session whose `performedOn` will not parse is dropped rather than bucketed
 * under a bogus Monday: a corrupt date key must not invent a week.
 */
export function groupByWeek(sessions: readonly Session[]): WeekGroup[] {
  const buckets = new Map<string, Session[]>();

  for (const session of sessions) {
    const weekStart = weekStartOf(session.performedOn);
    if (weekStart === null) continue;
    const bucket = buckets.get(weekStart);
    if (bucket === undefined) buckets.set(weekStart, [session]);
    else bucket.push(session);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, bucket]) => {
      bucket.sort(
        (a, b) =>
          b.performedOn.localeCompare(a.performedOn) ||
          (b.startedAt ?? '').localeCompare(a.startedAt ?? ''),
      );

      const totals = bucket.reduce<WeekTotals>(
        (sum, session) => {
          const one = sessionTotals(session);
          return {
            sessions: sum.sessions + 1,
            sets: sum.sets + one.sets,
            exercises: sum.exercises + one.exercises,
            volumeLoadKg: sum.volumeLoadKg + one.volumeLoadKg,
          };
        },
        { sessions: 0, sets: 0, exercises: 0, volumeLoadKg: 0 },
      );

      return { weekStart, weekEnd: weekEndOf(weekStart) ?? weekStart, sessions: bucket, totals };
    });
}

// --- One exercise, over time ---------------------------------------------

/**
 * One session's worth of work on one exercise.
 *
 * An exercise performed twice in a session — two occurrence indices, the early
 * heavy set and the back-off — is **one** performance here, holding both rows'
 * sets. The occurrence split exists so the overlay compares like with like
 * week to week; a trend line asking "how strong were you that day" wants the
 * day's best set, whichever slot produced it.
 */
export type ExercisePerformance = {
  sessionId: string;
  performedOn: string;
  workoutId: string | null;
  workoutName: string;
  workoutVersion: number | null;
  sets: LoggedSet[];
  /** The day's best set by adjusted e1RM, or null if none can be scored. */
  best: LoggedSet | null;
  /** That set's adjusted e1RM in kilograms, or null. */
  e1rmKg: number | null;
};

function bestScored(sets: readonly LoggedSet[]): { set: LoggedSet; e1rmKg: number } | null {
  let best: { set: LoggedSet; e1rmKg: number } | null = null;
  for (const set of performedSets(sets)) {
    const score = adjustedE1rm(set);
    if (score === null) continue;
    // Ties keep the earlier set, matching `strength.bestSet`.
    if (best === null || score > best.e1rmKg) best = { set, e1rmKg: score };
  }
  return best;
}

function matchesExercise(entry: SessionEntry, exerciseId: string): boolean {
  return entry.kind === 'exercise' && entry.exerciseId === exerciseId;
}

/**
 * Every performance of one lift, oldest first.
 *
 * Oldest-first because that is the order a trend reads in and the only order a
 * running record can be walked in; the screens that want newest-first reverse
 * it, which is cheaper than sorting twice.
 */
export function exercisePerformances(
  sessions: readonly Session[],
  exerciseId: string,
): ExercisePerformance[] {
  const performances: ExercisePerformance[] = [];

  for (const session of sessions) {
    const sets = session.entries
      .filter((entry) => matchesExercise(entry, exerciseId))
      .flatMap((entry) => workedSets(entry.sets));
    if (sets.length === 0) continue;

    const best = bestScored(sets);
    performances.push({
      sessionId: session.id,
      performedOn: session.performedOn,
      workoutId: session.workoutId,
      workoutName: session.workoutName,
      workoutVersion: session.workoutVersion,
      sets,
      best: best?.set ?? null,
      e1rmKg: best?.e1rmKg ?? null,
    });
  }

  return performances.sort(
    (a, b) => a.performedOn.localeCompare(b.performedOn) || a.sessionId.localeCompare(b.sessionId),
  );
}

/** The workouts a lift has actually been done on, for the history filter. */
export type WorkoutFilterOption = {
  /** Null is the ad-hoc bucket: real performances belonging to no workout. */
  workoutId: string | null;
  workoutName: string;
  count: number;
};

export function workoutFilterOptions(
  performances: readonly ExercisePerformance[],
): WorkoutFilterOption[] {
  const options = new Map<string, WorkoutFilterOption>();

  for (const performance of performances) {
    const key = performance.workoutId ?? '';
    const existing = options.get(key);
    if (existing === undefined) {
      options.set(key, {
        workoutId: performance.workoutId,
        workoutName: performance.workoutName,
        count: 1,
      });
    } else {
      existing.count += 1;
      // Performances arrive oldest first, so the last name wins and a renamed
      // workout offers its current name rather than the one it had in 2024.
      existing.workoutName = performance.workoutName;
    }
  }

  return [...options.values()].sort(
    (a, b) => b.count - a.count || a.workoutName.localeCompare(b.workoutName),
  );
}

/**
 * Scopes a lift's history to one workout — what separates PUSH bench from
 * CHEST-day bench (§2.6). `null` means every day.
 */
export function filterByWorkout(
  performances: readonly ExercisePerformance[],
  workoutId: string | null,
): ExercisePerformance[] {
  if (workoutId === null) return [...performances];
  return performances.filter((performance) => performance.workoutId === workoutId);
}

export type RecordMilestone = {
  performance: ExercisePerformance;
  set: LoggedSet;
  e1rmKg: number;
  /** The record it beat; 0 for the first, which is a baseline not a PR. */
  previousE1rmKg: number;
};

/**
 * The performances where the record moved, newest first.
 *
 * A running maximum walked forwards, so it is a *history* of the record rather
 * than a list of good days — and it necessarily agrees with the PR toast shown
 * at the time, because both use `beatsRecord` on adjusted e1RM.
 *
 * Computed over whatever slice it is given: filtered to one workout it reads
 * as "your best CHEST-day bench", which is a different and equally real
 * question from your best bench anywhere.
 */
export function recordMilestones(performances: readonly ExercisePerformance[]): RecordMilestone[] {
  const milestones: RecordMilestone[] = [];
  let record = 0;

  for (const performance of performances) {
    const { best, e1rmKg } = performance;
    if (best === null || e1rmKg === null) continue;
    if (!beatsRecord(e1rmKg, record)) continue;
    milestones.push({ performance, set: best, e1rmKg, previousE1rmKg: record });
    record = e1rmKg;
  }

  return milestones.reverse();
}

// --- Formatting ----------------------------------------------------------

const DAY_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
const SHORT_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** `Mon, Aug 25`, or the raw key if it will not parse. */
export function formatDayLabel(dateKey: string): string {
  const date = dateFromKey(dateKey);
  return date === null ? dateKey : date.toLocaleDateString(undefined, DAY_FORMAT);
}

/** `Aug 25`, for tight rows and the ends of an axis. */
export function formatShortDate(dateKey: string): string {
  const date = dateFromKey(dateKey);
  return date === null ? dateKey : date.toLocaleDateString(undefined, SHORT_FORMAT);
}

/**
 * A week's headline: `This week`, `Last week`, or the range it covers.
 *
 * Relative only for the two weeks a relative label is unambiguous in. Past
 * that, `3 weeks ago` makes you count backwards to place it, so the date range
 * is both shorter to read and more use.
 */
export function formatWeekLabel(weekStart: string, today: string = localDateKey()): string {
  const currentWeek = weekStartOf(today);
  if (currentWeek !== null) {
    const distance = weeksBetween(weekStart, currentWeek);
    if (distance === 0) return 'This week';
    if (distance === 1) return 'Last week';
  }
  const end = weekEndOf(weekStart);
  return end === null
    ? formatShortDate(weekStart)
    : `${formatShortDate(weekStart)} – ${formatShortDate(end)}`;
}

/**
 * Tonnage in the display unit, rounded to a whole unit and digit-grouped.
 *
 * Whole units because a tenth of a pound across a session's worth of sets is
 * noise, and grouped because five-figure tonnages are the normal case.
 */
export function formatVolumeLoad(kilograms: number, displayUnit: Unit): string {
  return `${Math.round(fromKg(kilograms, displayUnit)).toLocaleString()} ${displayUnit}`;
}

/**
 * An elapsed duration as `1h 15m` / `48m` / `< 1m`.
 *
 * Deliberately not `workouts.formatDuration`, which renders `m:ss` for the
 * rest timer's *running* clock. A ninety-minute session there reads as
 * `90:00`, which invites being read as ninety seconds; in a list of past
 * sessions the unit has to be on the number.
 */
export function formatElapsed(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return '< 1m';

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${String(minutes)}m`;
  return minutes === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(minutes)}m`;
}

/** `4 sets`, `1 set` — the count that stays honest on a bodyweight day. */
export function formatSetCount(sets: number): string {
  return `${formatNumber(sets, 0)} ${sets === 1 ? 'set' : 'sets'}`;
}
