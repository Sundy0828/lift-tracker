import { dateFromKey, localDateKey } from './sessions';

/**
 * The weekly schedule: which workouts belong to which weekday.
 *
 * **It holds workout ids and nothing else.** A plan that *contained* workouts
 * was rejected in BUILD_PLAN §0, because two copies of ABS accumulated two
 * divergent histories. A reference costs a lookup and keeps one workout, one
 * history — and it means renaming or editing a workout needs no schedule
 * write at all.
 *
 * Nothing here knows about a missed day. A schedule says what a weekday is
 * for; it does not grade you on whether you did it.
 */

/** 0 is Monday, 6 is Sunday — the order the calendar grids are drawn in. */
export type ScheduleDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const SCHEDULE_DAYS: readonly ScheduleDay[] = [0, 1, 2, 3, 4, 5, 6];

export type ScheduleEntry = {
  dayOfWeek: ScheduleDay;
  /** A `users/{uid}/workouts` id. Never the workout itself. */
  workoutId: string;
};

export type Schedule = {
  /** Ordered by day, then by the order they were added within a day. */
  entries: ScheduleEntry[];
};

export const EMPTY_SCHEDULE: Schedule = { entries: [] };

function isScheduleDay(value: unknown): value is ScheduleDay {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

/**
 * Which weekday a date key falls on, Monday-first.
 *
 * `getDay()` is Sunday-based, and mixing the two conventions is how a schedule
 * ends up one day out for exactly one user in exactly one timezone.
 */
export function dayOfWeekFor(dateKey: string): ScheduleDay | null {
  const date = dateFromKey(dateKey);
  if (date === null) return null;
  const shifted = (date.getDay() + 6) % 7;
  return isScheduleDay(shifted) ? shifted : null;
}

/** The workout ids a weekday is scheduled for, in order. */
export function workoutsOn(schedule: Schedule, day: ScheduleDay): string[] {
  return schedule.entries
    .filter((entry) => entry.dayOfWeek === day)
    .map((entry) => entry.workoutId);
}

/** What today is for. Empty when today is scheduled for nothing. */
export function scheduledOn(schedule: Schedule, dateKey: string = localDateKey()): string[] {
  const day = dayOfWeekFor(dateKey);
  return day === null ? [] : workoutsOn(schedule, day);
}

/** True when nothing is scheduled on any day. */
export function isEmpty(schedule: Schedule): boolean {
  return schedule.entries.length === 0;
}

/**
 * Replaces one day's workouts, leaving every other day alone.
 *
 * Duplicates are dropped: a workout twice on one Monday would start the same
 * session twice from one row, and the second is never what was meant.
 */
export function setDay(
  schedule: Schedule,
  day: ScheduleDay,
  workoutIds: readonly string[],
): Schedule {
  const others = schedule.entries.filter((entry) => entry.dayOfWeek !== day);
  const added = [...new Set(workoutIds)].map((workoutId) => ({ dayOfWeek: day, workoutId }));
  return { entries: sortEntries([...others, ...added]) };
}

/**
 * Drops every reference to a workout.
 *
 * Called when a workout is archived or deleted, so the schedule cannot point
 * at something that is not there. Rows are also filtered at read time, because
 * a workout can go on another device.
 */
export function withoutWorkout(schedule: Schedule, workoutId: string): Schedule {
  return { entries: schedule.entries.filter((entry) => entry.workoutId !== workoutId) };
}

/** Keeps only the rows whose workout still exists. */
export function prune(schedule: Schedule, liveWorkoutIds: ReadonlySet<string>): Schedule {
  return { entries: schedule.entries.filter((entry) => liveWorkoutIds.has(entry.workoutId)) };
}

function sortEntries(entries: readonly ScheduleEntry[]): ScheduleEntry[] {
  return [...entries].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/** Narrows an untrusted schedule document. An unusable row is dropped. */
export function parseSchedule(data: Record<string, unknown> | undefined): Schedule {
  if (data === undefined) return EMPTY_SCHEDULE;

  const raw: unknown = data['entries'];
  if (!Array.isArray(raw)) return EMPTY_SCHEDULE;

  const entries: ScheduleEntry[] = [];
  for (const value of raw as readonly unknown[]) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as Record<string, unknown>;
    const dayOfWeek: unknown = record['dayOfWeek'];
    const workoutId: unknown = record['workoutId'];

    if (!isScheduleDay(dayOfWeek)) continue;
    if (typeof workoutId !== 'string' || workoutId === '') continue;
    if (entries.some((entry) => entry.dayOfWeek === dayOfWeek && entry.workoutId === workoutId)) {
      continue;
    }
    entries.push({ dayOfWeek, workoutId });
  }

  return { entries: sortEntries(entries) };
}

const LONG: Intl.DateTimeFormatOptions = { weekday: 'long' };
const SHORT: Intl.DateTimeFormatOptions = { weekday: 'short' };

/** Monday-first weekday names, in the viewer's own locale. */
export function weekdayNames(style: 'long' | 'short' = 'long'): string[] {
  const format = new Intl.DateTimeFormat(undefined, style === 'long' ? LONG : SHORT);
  // 2024-01-01 was a Monday, so this walks Monday through Sunday.
  return SCHEDULE_DAYS.map((day) => format.format(new Date(2024, 0, 1 + day)));
}

/** One weekday's name, or an empty string for a day outside the week. */
export function weekdayName(day: ScheduleDay, style: 'long' | 'short' = 'long'): string {
  return weekdayNames(style)[day] ?? '';
}
