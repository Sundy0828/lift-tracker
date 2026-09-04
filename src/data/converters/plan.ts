import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { Plan, PlanVersion } from '@/domain/plans';
import { parsePlanWorkouts, parseWorkoutOrder } from '@/domain/plans';

/**
 * Maps plan documents onto the domain types. The narrowing itself lives in
 * `domain/plans` so it is testable without Firestore; this layer only turns
 * Firestore `Timestamp` values into ISO strings first.
 */

function isoOrNull(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

export function toPlan(id: string, data: DocumentData | undefined): Plan {
  const record = data ?? {};
  const currentVersion: unknown = record['currentVersion'];

  return {
    id,
    name: asString(record['name'], 'Untitled plan'),
    notes: typeof record['notes'] === 'string' ? record['notes'] : '',
    currentVersion:
      typeof currentVersion === 'number' && Number.isFinite(currentVersion) ? currentVersion : 0,
    workoutOrder: parseWorkoutOrder(record['workoutOrder']),
    workouts: parsePlanWorkouts(record['workouts']),
    archivedAt: isoOrNull(record['archivedAt']),
    createdAt: isoOrNull(record['createdAt']),
    updatedAt: isoOrNull(record['updatedAt']),
  };
}

export function toPlanVersion(id: string, data: DocumentData | undefined): PlanVersion {
  const record = data ?? {};
  const versionNumber: unknown = record['versionNumber'];

  return {
    versionNumber:
      typeof versionNumber === 'number' && Number.isFinite(versionNumber)
        ? versionNumber
        : Number(id),
    createdAt: isoOrNull(record['createdAt']),
    changeSummary: typeof record['changeSummary'] === 'string' ? record['changeSummary'] : '',
    workouts: parsePlanWorkouts(record['workouts']),
  };
}
