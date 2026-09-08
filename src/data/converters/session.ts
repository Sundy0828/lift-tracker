import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { ExerciseStats, WorkoutStats } from '@/domain/overlay';
import { parseExerciseStats, parseWorkoutStats } from '@/domain/overlay';
import type { Session } from '@/domain/sessions';
import { parseSession } from '@/domain/sessions';

/**
 * Maps session and overlay-stats documents onto the domain types. The
 * narrowing lives in `domain/sessions` and `domain/overlay` so it is testable
 * without Firestore; this layer only turns `Timestamp` values into ISO strings
 * first.
 *
 * `completedAt` inside a set is already an ISO string on the wire — it lives
 * in an array, where a `Timestamp` buys nothing and `serverTimestamp()` is not
 * even resolvable.
 */

function isoOrKeep(value: unknown): unknown {
  return value instanceof Timestamp ? value.toDate().toISOString() : value;
}

export function toSession(id: string, data: DocumentData | undefined): Session {
  const record = { ...(data ?? {}) };
  record['startedAt'] = isoOrKeep(record['startedAt']);
  record['completedAt'] = isoOrKeep(record['completedAt']);
  return parseSession(id, record);
}

export function toWorkoutStats(id: string, data: DocumentData | undefined): WorkoutStats {
  return parseWorkoutStats(id, data ?? {});
}

export function toExerciseStats(id: string, data: DocumentData | undefined): ExerciseStats {
  return parseExerciseStats(id, data ?? {});
}
