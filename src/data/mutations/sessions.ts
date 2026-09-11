import type { Query } from 'firebase/firestore';
import {
  Timestamp,
  deleteDoc,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { ExerciseStats, PersonalRecord } from '@/domain/overlay';
import { buildStatsUpdate } from '@/domain/overlay';
import { rebuildExerciseStats, rebuildWorkoutStats } from '@/domain/rebuild';
import type { NewSessionInput, Session, SessionEntry } from '@/domain/sessions';
import { newSession, sessionExerciseIds, totalPerformedSets } from '@/domain/sessions';
import type { Weight } from '@/domain/types';
import { toSession } from '../converters/session';
import { db } from '../firestore';
import { paths } from '../paths';

/**
 * Session writes. None but `completeSession` and `deleteSession` are awaited by the UI: Firestore
 * applies them to the local cache immediately and flushes on reconnect (§2.8). The whole point is
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
    exerciseIds: sessionExerciseIds(session.entries),
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
    { entries, exerciseIds: sessionExerciseIds(entries), updatedAt: serverTimestamp() },
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

/** How long to wait for the local cache, which answers in milliseconds. */
const CACHE_ACK_MS = 2000;

/** How long to wait for the server once the write is already safe locally. */
const SERVER_ACK_MS = 1500;

/** Resolves with the promise, or on its own once `ms` have passed. */
async function within(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });

  try {
    await Promise.race([promise, expiry]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves once the local cache reports the session completed.
 *
 * Firestore writes a mutation to IndexedDB before it raises the local view of
 * it, so this event is the point past which a reload cannot lose the write.
 * A listener error resolves too: it means no answer is coming.
 *
 * The first event can arrive while `onSnapshot` is still returning, when
 * another listener already holds a view of the same document, so the
 * unsubscribe is taken after the fact rather than from inside the callback.
 */
function cachedCompletion(uid: string, sessionId: string): Promise<void> {
  let stop: (() => void) | null = null;

  const seen = new Promise<void>((resolve) => {
    stop = onSnapshot(
      paths.session(uid, sessionId),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.get('status') === 'completed') resolve();
      },
      () => {
        resolve();
      },
    );
  });

  return seen.finally(() => {
    stop?.();
  });
}

/**
 * Waits until the completion is durable, then briefly for the server.
 *
 * The local cache is the durability guarantee, online or off: Firestore has
 * the mutation on disk by the time it reports it, so a reload cannot lose it.
 * The server is then given a short moment on top, so a refused write is
 * reported rather than swallowed. Throws only when the server answers within
 * that moment and refuses; after it, the write is queued and will retry.
 *
 * `navigator.onLine` is deliberately not consulted. It reports the link, not
 * whether Firestore can reach anything, and it is wrong often enough that
 * finishing a workout must not depend on it.
 */
async function settleCompletion(
  uid: string,
  sessionId: string,
  committed: Promise<void>,
): Promise<void> {
  // A rejection that arrives after the grace is a queued write Firestore will
  // retry, not something to fail the finish over.
  void committed.catch(() => undefined);

  await within(cachedCompletion(uid, sessionId), CACHE_ACK_MS);
  await within(committed, SERVER_ACK_MS);
}

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
 *
 * Awaited, unlike the writes above: the caller leaves the screen straight
 * after, and a reload before the batch reached disk left the session active
 * for ever. Throws when the server refuses the write while online.
 */
export async function completeSession(
  uid: string,
  session: Session,
  previousStats: (exerciseId: string) => ExerciseStats | null,
): Promise<CompleteSessionResult> {
  const completedAt = new Date().toISOString();
  const update = buildStatsUpdate(session, previousStats);

  const batch = writeBatch(db);
  batch.set(
    paths.session(uid, session.id),
    {
      status: 'completed',
      completedAt: Timestamp.fromDate(new Date(completedAt)),
      entries: session.entries,
      exerciseIds: sessionExerciseIds(session.entries),
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

  await settleCompletion(uid, session.id, batch.commit());
  return { prs: update.prs, completedAt };
}

/**
 * Abandons a session without writing any history.
 *
 * A session with a logged set is kept and marked abandoned: it is a fact about
 * the week, and it feeds no `workoutStats`, so next week's overlay still
 * resolves to the last session that was actually finished.
 *
 * A session with no logged set is deleted instead. It records nothing, so
 * history has nothing to show for it. Neither an active nor an abandoned
 * session writes to either stats index, so the delete repairs nothing.
 */
export function abandonSession(uid: string, session: Session): Promise<void> {
  if (totalPerformedSets(session.entries) === 0) {
    return deleteDoc(paths.session(uid, session.id));
  }

  return setDoc(
    paths.session(uid, session.id),
    { status: 'abandoned', completedAt: Timestamp.now(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** What a query returns from the server, without the session being deleted. */
async function remaining(source: Query, deletedId: string): Promise<Session[]> {
  const snapshot = await getDocsFromServer(source);
  return snapshot.docs
    .filter((document) => document.id !== deletedId)
    .map((document) => toSession(document.id, document.data()));
}

/**
 * Deletes a past session and repairs the overlay indexes it fed.
 *
 * The only awaited write here: `bestE1rm` and `totalSessions` are running
 * aggregates, so both stats tiers are recomputed from the sessions that
 * remain, read from the server. Rejects when offline or when the session is
 * still active.
 */
export async function deleteSession(uid: string, session: Session): Promise<void> {
  if (session.status === 'active') {
    throw new Error('A session in progress is discarded from Today, not deleted here.');
  }
  if (!navigator.onLine) {
    throw new Error('Deleting a session needs a connection, so records can be recalculated.');
  }

  const batch = writeBatch(db);
  batch.delete(paths.session(uid, session.id));

  // An abandoned session wrote no stats, so its delete needs no rebuild.
  if (session.status === 'completed') {
    const exercises = await Promise.all(
      sessionExerciseIds(session.entries).map(async (exerciseId) => ({
        exerciseId,
        stats: rebuildExerciseStats(
          exerciseId,
          await remaining(
            query(
              paths.sessions(uid),
              where('exerciseIds', 'array-contains', exerciseId),
              orderBy('performedOn', 'desc'),
            ),
            session.id,
          ),
        ),
      })),
    );

    for (const { exerciseId, stats } of exercises) {
      if (stats === null) {
        batch.delete(paths.exerciseStat(uid, exerciseId));
      } else {
        batch.set(paths.exerciseStat(uid, exerciseId), { ...stats, updatedAt: serverTimestamp() });
      }
    }

    const workoutId = session.workoutId;
    if (workoutId !== null) {
      // No `orderBy`: the rebuild sorts, and one equality filter runs on
      // Firestore's automatic index.
      const sessions = await remaining(
        query(paths.sessions(uid), where('workoutId', '==', workoutId)),
        session.id,
      );
      const stats = rebuildWorkoutStats(workoutId, sessions);
      if (stats === null) {
        batch.delete(paths.workoutStat(uid, workoutId));
      } else {
        batch.set(paths.workoutStat(uid, workoutId), { ...stats, updatedAt: serverTimestamp() });
      }
    }
  }

  // One batch, so a half-applied delete cannot leave an index describing a
  // session that is gone.
  await batch.commit();
}
