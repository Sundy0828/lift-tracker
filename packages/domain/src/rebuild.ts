import type { ExerciseStats, LastPerformance, WorkoutStats } from './overlay';
import { toPerformance } from './overlay';
import type { LoggedSet, Session, SessionEntry } from './sessions';
import { exerciseEntries, performedSets, workingSets } from './sessions';
import { adjustedE1rm, beatsRecord, bestSet } from './strength';
import { occurrenceKey } from './workouts';

/**
 * Rebuilds the overlay indexes from the sessions that remain.
 *
 * `buildStatsUpdate` maxes a record in and counts a session up, so a deleted
 * session cannot be subtracted from either document.
 */

/** One qualifying performance: an entry with performed sets, and its session. */
type Performance = { session: Session; entry: SessionEntry };

/** Oldest first, ties broken by start time. */
function chronological(sessions: readonly Session[]): Session[] {
  return [...sessions].sort(
    (a, b) =>
      a.performedOn.localeCompare(b.performedOn) ||
      (a.startedAt ?? '').localeCompare(b.startedAt ?? ''),
  );
}

function isCompleted(session: Session): boolean {
  return session.status === 'completed';
}

/** Every performance of one exercise, oldest first. */
function performances(exerciseId: string, sessions: readonly Session[]): Performance[] {
  const found: Performance[] = [];

  for (const session of chronological(sessions.filter(isCompleted))) {
    for (const entry of exerciseEntries(session.entries)) {
      if (entry.exerciseId !== exerciseId) continue;
      if (performedSets(entry.sets).length === 0) continue;
      found.push({ session, entry });
    }
  }
  return found;
}

/**
 * The tier-2 document one exercise should hold, given these sessions.
 *
 * Null when no remaining session performed the exercise; the caller then
 * deletes the document rather than storing a zero record.
 */
export function rebuildExerciseStats(
  exerciseId: string,
  sessions: readonly Session[],
): ExerciseStats | null {
  const found = performances(exerciseId, sessions);
  // The newest session, and its last entry when the exercise appears twice.
  const latest = found.at(-1);
  if (latest === undefined) return null;

  let bestE1rm = 0;
  let best: LoggedSet | null = null;
  let bestE1rmAt: string | null = null;
  let bestE1rmSessionId: string | null = null;
  const sessionIds = new Set<string>();

  // Walked oldest first, so a repeated best keeps the date it was first set.
  for (const { session, entry } of found) {
    sessionIds.add(session.id);

    const candidate = bestSet(entry.sets);
    const score = candidate === null ? 0 : (adjustedE1rm(candidate) ?? 0);
    if (!beatsRecord(score, bestE1rm)) continue;

    bestE1rm = score;
    best = candidate;
    bestE1rmAt = session.performedOn;
    bestE1rmSessionId = session.id;
  }

  return {
    exerciseId,
    lastSessionId: latest.session.id,
    lastPerformedOn: latest.session.performedOn,
    lastWorkoutId: latest.session.workoutId,
    lastWorkoutName: latest.session.workoutName,
    lastPrescription: latest.entry.prescription,
    lastSets: workingSets(latest.entry.sets),
    bestE1rm,
    bestE1rmAt,
    bestE1rmSessionId,
    bestSet: best,
    // Distinct sessions: benching twice in one session is one session.
    totalSessions: sessionIds.size,
  };
}

/**
 * The tier-1 document one workout should hold, given these sessions.
 *
 * Null when no remaining session performed the workout.
 */
export function rebuildWorkoutStats(
  workoutId: string,
  sessions: readonly Session[],
): WorkoutStats | null {
  const own = chronological(
    sessions.filter((session) => isCompleted(session) && session.workoutId === workoutId),
  );
  const latest = own.at(-1);
  if (latest === undefined) return null;

  const byOccurrence: Record<string, LastPerformance> = {};
  for (const entry of exerciseEntries(latest.entries)) {
    if (performedSets(entry.sets).length === 0) continue;
    byOccurrence[occurrenceKey(entry.exerciseId, entry.occurrenceIndex)] = toPerformance(
      latest,
      entry,
    );
  }

  return {
    workoutId,
    workoutName: latest.workoutName,
    lastSessionId: latest.id,
    lastPerformedOn: latest.performedOn,
    byOccurrence,
  };
}
