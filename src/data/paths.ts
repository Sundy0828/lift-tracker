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
  workouts: (uid: string): CollectionReference => collection(db, 'users', uid, 'workouts'),
  workout: (uid: string, workoutId: string): DocumentReference =>
    doc(db, 'users', uid, 'workouts', workoutId),
  workoutVersions: (uid: string, workoutId: string): CollectionReference =>
    collection(db, 'users', uid, 'workouts', workoutId, 'versions'),
  sessions: (uid: string): CollectionReference => collection(db, 'users', uid, 'sessions'),
  workoutStats: (uid: string): CollectionReference => collection(db, 'users', uid, 'workoutStats'),
  exerciseStats: (uid: string): CollectionReference =>
    collection(db, 'users', uid, 'exerciseStats'),
  sharedWorkouts: (): CollectionReference => collection(db, 'sharedWorkouts'),
} as const;
