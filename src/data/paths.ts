import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './firestore';

/**
 * Every Firestore path the app uses, in one place. All user data nests under
 * `users/{uid}` so the security rules stay a single ownership check.
 *
 * Profile fields live directly on the `users/{uid}` document rather than in a
 * nested map, so reading a profile is one document read and updating a single
 * preference needs no dotted field paths.
 */
export const paths = {
  user: (uid: string): DocumentReference => doc(db, 'users', uid),
  customExercises: (uid: string): CollectionReference =>
    collection(db, 'users', uid, 'customExercises'),
  customExercise: (uid: string, id: string): DocumentReference =>
    doc(db, 'users', uid, 'customExercises', id),
  workouts: (uid: string): CollectionReference => collection(db, 'users', uid, 'workouts'),
  workout: (uid: string, workoutId: string): DocumentReference =>
    doc(db, 'users', uid, 'workouts', workoutId),
  workoutVersions: (uid: string, workoutId: string): CollectionReference =>
    collection(db, 'users', uid, 'workouts', workoutId, 'versions'),
  /** The version number *is* the document id, so an old session is one read. */
  workoutVersion: (uid: string, workoutId: string, versionNumber: number): DocumentReference =>
    doc(db, 'users', uid, 'workouts', workoutId, 'versions', String(versionNumber)),
  sessions: (uid: string): CollectionReference => collection(db, 'users', uid, 'sessions'),
  session: (uid: string, sessionId: string): DocumentReference =>
    doc(db, 'users', uid, 'sessions', sessionId),
  workoutStats: (uid: string): CollectionReference => collection(db, 'users', uid, 'workoutStats'),
  /** Tier 1 of the overlay: one document per workout, id-for-id (§2.6). */
  workoutStat: (uid: string, workoutId: string): DocumentReference =>
    doc(db, 'users', uid, 'workoutStats', workoutId),
  exerciseStats: (uid: string): CollectionReference =>
    collection(db, 'users', uid, 'exerciseStats'),
  /** Tier 2 plus the PR record: one document per exercise. */
  exerciseStat: (uid: string, exerciseId: string): DocumentReference =>
    doc(db, 'users', uid, 'exerciseStats', exerciseId),
  sharedWorkouts: (): CollectionReference => collection(db, 'sharedWorkouts'),
  /** Public-read, owner-only-write: the one collection outside `users/` (§2.9). */
  sharedWorkout: (shareId: string): DocumentReference => doc(db, 'sharedWorkouts', shareId),
} as const;
