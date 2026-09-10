import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { SharedWorkout } from '@/domain/sharing';
import { parseSharedWorkout } from '@/domain/sharing';

/**
 * Maps a share document onto the domain type. The narrowing lives in
 * `domain/sharing` so it is testable without Firestore; this layer only turns
 * the `Timestamp` into an ISO string first.
 *
 * A share is the one document the app reads that it did not write, so the
 * parser it hands off to is deliberately defensive rather than trusting.
 */
export function toSharedWorkout(id: string, data: DocumentData | undefined): SharedWorkout | null {
  if (data === undefined) return null;

  const record = { ...data };
  const createdAt: unknown = record['createdAt'];
  record['createdAt'] = createdAt instanceof Timestamp ? createdAt.toDate().toISOString() : null;

  return parseSharedWorkout(id, record);
}
