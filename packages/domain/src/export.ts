import type { LoggedSet, Session } from './sessions';
import { exerciseEntries, localDateKey } from './sessions';
import { adjustedE1rm, loadKg } from './strength';
import type { Unit } from './types';
import { fromKg } from './units';

/**
 * Getting the data out.
 *
 * Two formats because they answer two questions. **JSON** is the session
 * documents as the app stores them — a faithful copy, and the only one that
 * could ever be read back in. **CSV** is one row per set, which is the shape a
 * spreadsheet, a notebook or somebody else's tracker can actually use.
 *
 * Both are built here, as strings, from sessions already fetched. Nothing in
 * this module knows about files, blobs or the network.
 */

/** Column order. Stable, because a saved spreadsheet formula depends on it. */
const COLUMNS = [
  'performed_on',
  'session_id',
  'workout_name',
  'workout_version',
  'status',
  'started_at',
  'completed_at',
  'session_seconds',
  'exercise_name',
  'exercise_id',
  'occurrence',
  'set_number',
  'is_warmup',
  'skipped',
  'weight',
  'weight_unit',
  'reps',
  'rir',
  'rest_taken_seconds',
  'e1rm',
  'set_completed_at',
  'exercise_notes',
  'session_notes',
] as const;

/**
 * Quotes a field for CSV, and defuses a formula.
 *
 * A workout can be called anything, and a name beginning `=`, `+`, `-` or `@`
 * is executed as a formula by every spreadsheet that opens the file. Prefixing
 * an apostrophe is what stops an export of your own training log from running
 * something when you double-click it.
 */
function cell(value: string | number | boolean | null): string {
  if (value === null) return '';

  const text = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  const defused = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return /["\n\r,]/u.test(defused) ? `"${defused.replaceAll('"', '""')}"` : defused;
}

function row(values: readonly (string | number | boolean | null)[]): string {
  return values.map(cell).join(',');
}

/** The 1-based position of a set among the ones shown, warmups lettered apart. */
function setNumber(sets: readonly LoggedSet[], set: LoggedSet): number {
  return sets.filter((other) => other.isWarmup === set.isWarmup).indexOf(set) + 1;
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

/**
 * Every set of every session, one per row, in the display unit.
 *
 * Converted rather than exported as entered: a column that silently mixes lb
 * and kg cannot be summed, which is the first thing anyone does with it. The
 * unit each set was *logged* in is kept in its own column, so nothing is lost.
 *
 * Rest rows carry no sets and never appear. A session with nothing logged
 * still gets no row: the file is a log of work done.
 */
export function sessionsToCsv(sessions: readonly Session[], displayUnit: Unit): string {
  const lines: string[] = [COLUMNS.join(',')];

  for (const session of sessions) {
    const seconds =
      session.startedAt === null || session.completedAt === null
        ? null
        : Math.max(
            0,
            Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 1000),
          );

    for (const entry of exerciseEntries(session.entries)) {
      for (const set of entry.sets) {
        const kilograms = loadKg(set);

        lines.push(
          row([
            session.performedOn,
            session.id,
            session.workoutName,
            session.workoutVersion,
            session.status,
            session.startedAt,
            session.completedAt,
            Number.isNaN(seconds) ? null : seconds,
            entry.exerciseName,
            entry.exerciseId,
            entry.occurrenceIndex + 1,
            setNumber(entry.sets, set),
            set.isWarmup,
            set.skipped,
            kilograms === null ? null : round(fromKg(kilograms, displayUnit)),
            set.weight?.unit ?? null,
            set.reps,
            set.rir,
            set.restTakenSeconds,
            round(adjustedE1rm(set) === null ? null : fromKg(adjustedE1rm(set) ?? 0, displayUnit)),
            set.completedAt,
            entry.notes,
            session.notes,
          ]),
        );
      }
    }
  }

  // A trailing newline, so appending to the file or piping it to a tool that
  // reads line by line does not lose the last row.
  return `${lines.join('\n')}\n`;
}

/** What a JSON export carries besides the sessions, so it can be read later. */
export type ExportEnvelope = {
  /** Bumped only when the shape changes in a way a reader would notice. */
  formatVersion: 1;
  exportedAt: string;
  sessionCount: number;
  sessions: readonly Session[];
};

/**
 * The sessions as stored, wrapped in enough context to be read back.
 *
 * Weights stay in the unit they were entered in (§2.7) — unlike the CSV, this
 * is a copy rather than a report, and rewriting the numbers would make it a
 * lossy one.
 */
export function sessionsToJson(
  sessions: readonly Session[],
  exportedAt: string = new Date().toISOString(),
): string {
  const envelope: ExportEnvelope = {
    formatVersion: 1,
    exportedAt,
    sessionCount: sessions.length,
    sessions,
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/** `lift-tracker-2026-09-16.csv`. Dated, because exports accumulate. */
export function exportFilename(extension: 'csv' | 'json', today: string = localDateKey()): string {
  return `lift-tracker-${today}.${extension}`;
}
