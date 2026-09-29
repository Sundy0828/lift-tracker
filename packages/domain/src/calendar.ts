import { addDays, sessionDurationSeconds, sessionTotals, weekStartOf } from './history';
import type { Session } from './sessions';
import { dateFromKey, isDateKey, localDateKey } from './sessions';

/**
 * History as a calendar: what happened on each day, and what it adds up to
 * over a week, a month, a year and all of it.
 *
 * Everything here is a pure function over sessions already fetched, like
 * `domain/history`, and keys on `performedOn` for the same reason — a session
 * begun at 11pm belongs to the night it was done.
 *
 * **The grids are built from date keys, never from a rolling `Date`.** A month
 * laid out by adding 24 hours at a time repeats or skips a day across a
 * daylight-saving change, and the day it skips is the one a dot goes missing
 * from.
 */

// --- One session, as the calendar needs it -------------------------------

/**
 * Everything a calendar square needs about one session.
 *
 * Deliberately four numbers and a date, with no sets in it. A session document
 * carries every rep you logged, and a year of five-day weeks is megabytes —
 * far too much to fetch in order to shade some squares. This is the shape the
 * day index stores (see `domain/dayIndex`), and the shape the calendar reads.
 */
export type DaySummary = {
  sessionId: string;
  performedOn: string;
  /** Seconds of session time. Only a finished session can contribute. */
  seconds: number;
  sets: number;
  volumeLoadKg: number;
};

export function summariseSession(session: Session): DaySummary {
  const totals = sessionTotals(session);
  return {
    sessionId: session.id,
    performedOn: session.performedOn,
    seconds: sessionDurationSeconds(session) ?? 0,
    sets: totals.sets,
    volumeLoadKg: totals.volumeLoadKg,
  };
}

// --- One day -------------------------------------------------------------

export type DayActivity = {
  dateKey: string;
  sessions: number;
  /** Seconds of session time. Only a finished session can contribute. */
  seconds: number;
  sets: number;
  volumeLoadKg: number;
};

export type ActivityByDay = ReadonlyMap<string, DayActivity>;

/**
 * Summaries rolled up per day.
 *
 * Two sessions on one day — PUSH then ABS — become one entry holding both,
 * which is what makes a day a dot rather than a stack of them.
 */
export function activityByDay(summaries: readonly DaySummary[]): ActivityByDay {
  const byDay = new Map<string, DayActivity>();

  for (const summary of summaries) {
    if (!isDateKey(summary.performedOn)) continue;

    const existing = byDay.get(summary.performedOn);
    byDay.set(summary.performedOn, {
      dateKey: summary.performedOn,
      sessions: (existing?.sessions ?? 0) + 1,
      seconds: (existing?.seconds ?? 0) + summary.seconds,
      sets: (existing?.sets ?? 0) + summary.sets,
      volumeLoadKg: (existing?.volumeLoadKg ?? 0) + summary.volumeLoadKg,
    });
  }

  return byDay;
}

// --- Periods -------------------------------------------------------------

export type PeriodTotals = {
  sessions: number;
  seconds: number;
  sets: number;
  volumeLoadKg: number;
  /** Distinct days trained — the number a dot calendar is counting. */
  days: number;
};

const EMPTY_TOTALS: PeriodTotals = { sessions: 0, seconds: 0, sets: 0, volumeLoadKg: 0, days: 0 };

/**
 * Everything logged between two date keys, both inclusive. A null bound is
 * open, so all-time is `periodTotals(byDay, null, null)`.
 */
export function periodTotals(
  byDay: ActivityByDay,
  from: string | null,
  to: string | null,
): PeriodTotals {
  let totals = EMPTY_TOTALS;

  for (const day of byDay.values()) {
    if (from !== null && day.dateKey < from) continue;
    if (to !== null && day.dateKey > to) continue;

    totals = {
      sessions: totals.sessions + day.sessions,
      seconds: totals.seconds + day.seconds,
      sets: totals.sets + day.sets,
      volumeLoadKg: totals.volumeLoadKg + day.volumeLoadKg,
      days: totals.days + 1,
    };
  }

  return totals;
}

/** The earliest day anything was logged, or null for an empty history. */
export function firstTrainedDay(byDay: ActivityByDay): string | null {
  let earliest: string | null = null;
  for (const key of byDay.keys()) {
    if (earliest === null || key < earliest) earliest = key;
  }
  return earliest;
}

// --- Months and years ----------------------------------------------------

/** `YYYY-MM` for a date key: a month's identity and its sort order. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** The first day of a month, from its `YYYY-MM` key. */
export function monthStart(monthKey: string): string {
  return `${monthKey}-01`;
}

/**
 * The last day of a month. Stepped back one day from the first of the next, so
 * February and leap years need no table.
 */
export function monthEnd(monthKey: string): string {
  return addDays(monthStart(shiftMonth(monthKey, 1)), -1) ?? monthStart(monthKey);
}

/** The month `offset` months away, as a `YYYY-MM` key. */
export function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (year === undefined || month === undefined || Number.isNaN(year) || Number.isNaN(month)) {
    return monthKey;
  }

  // Counted in months since year 0, so December to January carries on its own.
  const index = year * 12 + (month - 1) + offset;
  const shiftedYear = Math.floor(index / 12);
  const shiftedMonth = index - shiftedYear * 12 + 1;
  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

export function yearStart(year: number): string {
  return `${String(year).padStart(4, '0')}-01-01`;
}

export function yearEnd(year: number): string {
  return `${String(year).padStart(4, '0')}-12-31`;
}

// --- Grids ---------------------------------------------------------------

export type CalendarWeek = {
  /** Monday's date key — the row's identity and its sort order. */
  weekStart: string;
  /** Seven date keys. Null where the day falls outside the period. */
  days: (string | null)[];
};

/** One Monday-first row of seven, with days outside `[from, to]` blanked. */
function weekRow(weekStart: string, from: string, to: string): CalendarWeek {
  const days: (string | null)[] = [];
  for (let day = 0; day < 7; day += 1) {
    const key = addDays(weekStart, day);
    days.push(key !== null && key >= from && key <= to ? key : null);
  }
  return { weekStart, days };
}

/**
 * Every Monday-first week touching `[from, to]`.
 *
 * Days either side are blanked rather than borrowed from the neighbouring
 * month: a dot in a foreign cell reads as training you did in the period and
 * did not.
 */
function weekRows(from: string, to: string): CalendarWeek[] {
  const start = weekStartOf(from);
  if (start === null) return [];

  const rows: CalendarWeek[] = [];
  let cursor = start;

  while (cursor <= to) {
    rows.push(weekRow(cursor, from, to));
    const next = addDays(cursor, 7);
    if (next === null) break;
    cursor = next;
  }

  return rows;
}

/** One month as Monday-first rows of seven. */
export function monthGrid(monthKey: string): CalendarWeek[] {
  return weekRows(monthStart(monthKey), monthEnd(monthKey));
}

/**
 * One year as Monday-first week columns — the contribution-graph shape, where
 * a column is a week and a row is a weekday.
 *
 * **Returned whole, and drawn in bands.** Fifty-three columns across a phone
 * is a four-pixel square, so `ActivityCalendar` splits these into two halves
 * stacked vertically: same shape, twice the square, and a full year with no
 * sideways scrolling. Splitting is a layout decision, so it lives there.
 *
 * The first and last columns run into the neighbouring years, so every row
 * stays one weekday the whole way across.
 */
export function yearGrid(year: number): CalendarWeek[] {
  return weekRows(yearStart(year), yearEnd(year));
}

// --- Streaks -------------------------------------------------------------

export type WeekStreak = {
  /** Consecutive weeks trained, counting back from the most recent one. */
  current: number;
  /** The longest run there has been. Kept when the current one ends. */
  best: number;
  /** Whether anything is logged in the week that is still running. */
  trainedThisWeek: boolean;
};

const NO_STREAK: WeekStreak = { current: 0, best: 0, trainedThisWeek: false };

/** Every week with at least one session, as Monday keys, oldest first. */
export function trainedWeeks(byDay: ActivityByDay): string[] {
  const weeks = new Set<string>();
  for (const key of byDay.keys()) {
    const start = weekStartOf(key);
    if (start !== null) weeks.add(start);
  }
  return [...weeks].sort();
}

/**
 * The run of weeks trained, and the longest there has been.
 *
 * **The current week is never counted against you.** A week with nothing in it
 * yet is a week still in progress, so the run counts back from last week when
 * this one is empty. That is the difference between a streak that says what
 * you have done and one that tells you off on a Tuesday morning.
 */
export function weekStreak(byDay: ActivityByDay, today: string = localDateKey()): WeekStreak {
  const weeks = trainedWeeks(byDay);
  const thisWeek = weekStartOf(today);
  if (weeks.length === 0 || thisWeek === null) return NO_STREAK;

  let best = 0;
  let run = 0;
  let previous: string | null = null;

  for (const week of weeks) {
    run = previous !== null && addDays(previous, 7) === week ? run + 1 : 1;
    if (run > best) best = run;
    previous = week;
  }

  const latest = weeks[weeks.length - 1] ?? null;
  const live = latest === thisWeek || latest === addDays(thisWeek, -7);

  return { current: live ? run : 0, best, trainedThisWeek: latest === thisWeek };
}

// --- Formatting ----------------------------------------------------------

const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };

/** `August 2026`, or the raw key if it will not parse. */
export function formatMonthLabel(monthKey: string): string {
  const date = dateFromKey(monthStart(monthKey));
  return date === null ? monthKey : date.toLocaleDateString(undefined, MONTH_FORMAT);
}

/** Monday-first weekday initials, in the viewer's own locale. */
export function weekdayInitials(): string[] {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
  // 2024-01-01 was a Monday, so this walks Monday through Sunday.
  return [0, 1, 2, 3, 4, 5, 6].map((day) => formatter.format(new Date(2024, 0, 1 + day)));
}

/**
 * How hard a day was, on the five-stop scale the muscle map uses.
 *
 * Banded on set count rather than tonnage, so a bodyweight day is not a blank
 * square. Absolute bounds, like `domain/volume`: a light week should look
 * light rather than being rescaled to fill the grid.
 */
export const DAY_STOPS: readonly [number, number, number, number] = [1, 10, 18, 28];

export function dayStop(
  sets: number,
  lowerBounds: readonly [number, number, number, number] = DAY_STOPS,
): 0 | 1 | 2 | 3 | 4 {
  if (sets < lowerBounds[0]) return 0;
  if (sets < lowerBounds[1]) return 1;
  if (sets < lowerBounds[2]) return 2;
  if (sets < lowerBounds[3]) return 3;
  return 4;
}
