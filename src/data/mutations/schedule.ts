import { setDoc } from 'firebase/firestore';
import type { Schedule, ScheduleDay } from '@/domain/schedule';
import { setDay, withoutWorkout } from '@/domain/schedule';
import { paths } from '../paths';

/**
 * The weekly schedule, as one document.
 *
 * One document rather than a row per day: a week is a handful of ids, it is
 * read whole by Today and written whole by the editor, and a single document
 * is one offline-safe write (§2.8).
 *
 * Writes are never awaited by the UI. Firestore applies them to the local
 * cache synchronously and the listener re-renders from it.
 */
export function saveSchedule(uid: string, schedule: Schedule): Promise<void> {
  // Plain objects, not the domain values: Firestore rejects anything it did
  // not produce, and an entry is already flat.
  return setDoc(paths.schedule(uid), {
    entries: schedule.entries.map((entry) => ({
      dayOfWeek: entry.dayOfWeek,
      workoutId: entry.workoutId,
    })),
  });
}

/** Replaces one weekday, leaving the rest of the week alone. */
export function saveScheduleDay(
  uid: string,
  schedule: Schedule,
  day: ScheduleDay,
  workoutIds: readonly string[],
): Promise<void> {
  return saveSchedule(uid, setDay(schedule, day, workoutIds));
}

/**
 * Drops a workout from every day it appears on.
 *
 * Called when a workout is archived or deleted. The read path filters unknown
 * ids anyway — a workout can go on another device — but leaving stale rows in
 * the document would mean the editor shows days that are secretly empty.
 */
export function unschedule(uid: string, schedule: Schedule, workoutId: string): Promise<void> {
  return saveSchedule(uid, withoutWorkout(schedule, workoutId));
}
