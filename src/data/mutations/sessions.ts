import { Timestamp, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import type { ExerciseStats, PersonalRecord } from '@/domain/overlay';
import { buildStatsUpdate } from '@/domain/overlay';
import type { NewSessionInput, Session, SessionEntry } from '@/domain/sessions';
import { newSession } from '@/domain/sessions';
import type { Weight } from '@/domain/types';
import { db } from '../firestore';
import { paths } from '../paths';

/**
 * Session writes. None are awaited by the UI: Firestore applies them to the
 * local cache immediately and flushes on reconnect (§2.8). The whole point is
 * that a workout logged in airplane mode behaves exactly like one logged on
 * wifi, including the rest timer and the overlay.
 *
 * **Client timestamps throughout, not `serverTimestamp()`.** A pending server
 * timestamp reads back as null from the local cache, so an offline session
 * would show no start time and sort last in history — and when a set was
 * finished is a client fact anyway. `updatedAt` keeps the server timestamp:
 * nothing renders or sorts on it, so its local null is harmless.
 */

export function newSessionId(): string {
  return crypto.randomUUID();
}

/** Everything but the sets: the shape a session document is created with. */
function toDocument(session: Session): Record<string, unknown> {
  return {
    workoutId: session.workoutId,
    workoutVersion: session.workoutVersion,
    workoutName: session.workoutName,
    status: session.status,
    performedOn: session.performedOn,
    startedAt: session.startedAt === null ? null : Timestamp.fromDate(new Date(session.startedAt)),
    completedAt: null,
    entries: session.entries,
    groupRest: session.groupRest,
    bodyweight: session.bodyweight,
    notes: session.notes,
    updatedAt: serverTimestamp(),
  };
}

/**
 * Starts a session and returns it, without waiting for the write.
 *
 * The whole document — every prescribed set row — is written up front, so the
 * log screen renders from one cached document and a set entered ten seconds
 * later is an update to something that already exists.
 */
export function startSession(
  uid: string,
  input: NewSessionInput,
): { session: Session; promise: Promise<void> } {
  const session = newSession(input);
  return { session, promise: setDoc(paths.session(uid, session.id), toDocument(session)) };
}

/**
 * Writes the whole `entries` array.
 *
 * Not a targeted array update: Firestore has no "patch element 3" operation,
 * and one user on one device has no merge conflict to design around. The
 * caller debounces (~500 ms), so a burst of keystrokes is one write.
 */
export function saveSessionEntries(
  uid: string,
  sessionId: string,
  entries: readonly SessionEntry[],
): Promise<void> {
  return setDoc(
    paths.session(uid, sessionId),
    { entries, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function saveSessionNotes(uid: string, sessionId: string, notes: string): Promise<void> {
  return setDoc(
    paths.session(uid, sessionId),
    { notes, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function saveBodyweight(
  uid: string,
  sessionId: string,
  bodyweight: Weight | null,
): Promise<void> {
  return setDoc(
    paths.session(uid, sessionId),
    { bodyweight, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Moves a session to another calendar day.
 *
 * Stamped automatically from the local date and editable but never required —
 * a workout logged the next morning belongs to the night before, and nobody
 * should have to answer a date question to start lifting.
 */
export function savePerformedOn(
  uid: string,
  sessionId: string,
  performedOn: string,
): Promise<void> {
  return setDoc(
    paths.session(uid, sessionId),
    { performedOn, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export type CompleteSessionResult = { prs: readonly PersonalRecord[]; completedAt: string };

/**
 * Completes a session: the status, the denormalised overlay indexes, and the
 * PR records, in **one batch**.
 *
 * One batch matters offline. Either the session is finished and both stats
 * documents agree with it, or nothing changed — a half-applied completion
 * would leave `workoutStats` claiming a performance the session never
 * recorded.
 *
 * `previousStats` is supplied by the caller rather than read back here. The
 * active-session screen is already subscribed to these documents for the
 * tier-2 fallback, so the values are in the local cache before the button is
 * pressed, and completion needs no round trip.
 */
export function completeSession(
  uid: string,
  session: Session,
  previousStats: (exerciseId: string) => ExerciseStats | null,
): { promise: Promise<void>; result: CompleteSessionResult } {
  const completedAt = new Date().toISOString();
  const update = buildStatsUpdate(session, previousStats);

  const batch = writeBatch(db);
  batch.set(
    paths.session(uid, session.id),
    {
      status: 'completed',
      completedAt: Timestamp.fromDate(new Date(completedAt)),
      entries: session.entries,
      performedOn: session.performedOn,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Tier 1 is overwritten rather than merged: it is "the last performance of
  // this workout", so an exercise no longer in it must stop overlaying.
  if (update.workoutStats !== null) {
    batch.set(paths.workoutStat(uid, update.workoutStats.workoutId), {
      ...update.workoutStats,
      updatedAt: serverTimestamp(),
    });
  }

  // Tier 2 is also written whole, but the value was already merged with the
  // previous document by `buildStatsUpdate` — `bestE1rm` is a running maximum
  // and `totalSessions` a running count, both computed there.
  for (const [exerciseId, stats] of update.exerciseStats) {
    batch.set(paths.exerciseStat(uid, exerciseId), { ...stats, updatedAt: serverTimestamp() });
  }

  return { promise: batch.commit(), result: { prs: update.prs, completedAt } };
}

/**
 * Abandons a session without writing any history.
 *
 * Kept rather than deleted: an abandoned session is a fact about the week, and
 * because it feeds no `workoutStats`, next week's overlay still resolves to
 * the last session that was actually finished.
 */
export function abandonSession(uid: string, sessionId: string): Promise<void> {
  return setDoc(
    paths.session(uid, sessionId),
    { status: 'abandoned', completedAt: Timestamp.now(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}
