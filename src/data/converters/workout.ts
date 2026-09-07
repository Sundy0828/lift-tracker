import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { Workout, WorkoutVersion } from '@/domain/workouts';
import { parseWorkoutBody } from '@/domain/workouts';

/**
 * Maps workout documents onto the domain types. The narrowing itself lives in
 * `domain/workouts` so it is testable without Firestore; this layer only turns
 * Firestore `Timestamp` values into ISO strings first.
 */

function isoOrNull(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function toWorkout(id: string, data: DocumentData | undefined): Workout {
  const record = data ?? {};

  return {
    id,
    ...parseWorkoutBody(record),
    notes: typeof record['notes'] === 'string' ? record['notes'] : '',
    currentVersion: asNumber(record['currentVersion'], 0),
    archivedAt: isoOrNull(record['archivedAt']),
    createdAt: isoOrNull(record['createdAt']),
    updatedAt: isoOrNull(record['updatedAt']),
  };
}

export function toWorkoutVersion(id: string, data: DocumentData | undefined): WorkoutVersion {
  const record = data ?? {};

  return {
    ...parseWorkoutBody(record),
    // The document id *is* the version number, so it is the fallback when the
    // stored field is missing or malformed.
    versionNumber: asNumber(record['versionNumber'], Number(id)),
    createdAt: isoOrNull(record['createdAt']),
    changeSummary: typeof record['changeSummary'] === 'string' ? record['changeSummary'] : '',
  };
}
