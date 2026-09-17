import type { DaySummary } from './calendar';
import { isDateKey } from './sessions';

/**
 * The day index: one small document a year, so a calendar never reads a
 * session.
 *
 * **The problem it solves.** A session document carries every set you logged.
 * Drawing a year of squares from those means fetching megabytes to end up with
 * three numbers a day, and the cost grows with every session you ever do. So
 * the calendar reads this instead: `users/{uid}/calendar/{YYYY}`, holding one
 * short row per session.
 *
 * **One row per session, keyed by session id** — not per-day counters. A
 * counter has to be incremented on completion and decremented on delete, and
 * a write that lands twice or not at all leaves a number nobody can check. A
 * row keyed by the session it describes is idempotent: completing, abandoning,
 * re-dating or deleting a session each rewrites or removes exactly that one
 * field, and doing it twice changes nothing.
 *
 * The index is a **cache of the sessions**, never the record. Anything it
 * cannot parse is dropped, and `DAY_INDEX_VERSION` exists so a shape change
 * can force it to be rebuilt from the sessions themselves.
 */

/** Bumped when the row shape changes, to force a rebuild. */
export const DAY_INDEX_VERSION = 1;

/** Field names are short because they repeat once per session. */
type IndexRow = {
  /** `performedOn`, in full. */
  d: string;
  /** Sets done. */
  s: number;
  /** Seconds of session time. */
  t: number;
  /** Tonnage in kilograms. */
  v: number;
};

/** Which yearly document a session belongs in, or null for a bad date. */
export function indexYearOf(performedOn: string): string | null {
  return isDateKey(performedOn) ? performedOn.slice(0, 4) : null;
}

export function toIndexRow(summary: DaySummary): Record<string, unknown> {
  return {
    d: summary.performedOn,
    s: Math.max(0, Math.round(summary.sets)),
    t: Math.max(0, Math.round(summary.seconds)),
    // Two decimals: tonnage is a sum of converted loads, and full float noise
    // in a document read on every calendar open buys nothing.
    v: Math.round(summary.volumeLoadKg * 100) / 100,
  };
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function parseRow(sessionId: string, value: unknown): DaySummary | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Partial<IndexRow>;
  if (!isDateKey(row.d)) return null;

  return {
    sessionId,
    performedOn: row.d,
    seconds: asNumber(row.t),
    sets: asNumber(row.s),
    volumeLoadKg: asNumber(row.v),
  };
}

/**
 * One yearly document as summaries. A row that will not parse is dropped
 * rather than repaired — the sessions are the record, and a rebuild restores
 * it.
 */
export function parseDayIndex(data: Record<string, unknown> | undefined): DaySummary[] {
  if (data === undefined) return [];

  const raw: unknown = data['sessions'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];

  const summaries: DaySummary[] = [];
  for (const [sessionId, value] of Object.entries(raw as Record<string, unknown>)) {
    const summary = parseRow(sessionId, value);
    if (summary !== null) summaries.push(summary);
  }
  return summaries;
}

/** Summaries grouped into the yearly documents they belong in. */
export function byIndexYear(
  summaries: readonly DaySummary[],
): Map<string, Map<string, DaySummary>> {
  const years = new Map<string, Map<string, DaySummary>>();

  for (const summary of summaries) {
    const year = indexYearOf(summary.performedOn);
    if (year === null) continue;

    const rows = years.get(year) ?? new Map<string, DaySummary>();
    rows.set(summary.sessionId, summary);
    years.set(year, rows);
  }

  return years;
}
