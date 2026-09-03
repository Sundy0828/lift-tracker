import { Timestamp, type DocumentData } from 'firebase/firestore';
import type { CustomExercise } from '@/domain/exercises';
import { parseCustomExercise } from '@/domain/exercises';

/**
 * Maps a custom-exercise document onto the domain type. The narrowing itself
 * lives in `domain/exercises` so it can be unit-tested without Firestore; this
 * layer only converts Firestore's `Timestamp` into an ISO string first.
 */
export function toCustomExercise(id: string, data: DocumentData | undefined): CustomExercise {
  if (data === undefined) return parseCustomExercise(id, {});

  const createdAt: unknown = data['createdAt'];
  return parseCustomExercise(id, {
    ...data,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate().toISOString() : null,
  });
}
