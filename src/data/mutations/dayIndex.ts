import {
  deleteField,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  writeBatch,
} from 'firebase/firestore';
import type { WriteBatch } from 'firebase/firestore';
import type { DaySummary } from '@/domain/calendar';
import { summariseSession } from '@/domain/calendar';
import { DAY_INDEX_VERSION, byIndexYear, indexYearOf, toIndexRow } from '@/domain/dayIndex';
import type { Session } from '@/domain/sessions';
import { toSession } from '../converters/session';
import { db } from '../firestore';
import { paths } from '../paths';
import { setDayIndexVersion } from './profile';

/**
 * Keeping the day index in step with the sessions (see `domain/dayIndex`).
 *
 * Every write here goes into a **batch the caller already has**, so the index
 * moves in the same atomic write as the session it describes. A completion
 * that landed without its index row, or an index row that outlived its
 * session, is the one failure this design has to rule out.
 *
 * Rows are merged into the yearly document rather than written over it: two
 * sessions completed on the same day must not overwrite each other, and a
 * document that does not exist yet is created by the merge.
 */

/** A session belongs in the index once it is no longer running. */
function isIndexable(session: Session): boolean {
  return session.status !== 'active';
}

/** Writes the session's row into its year, creating the document if needed. */
export function indexSession(batch: WriteBatch, uid: string, session: Session): void {
  const year = indexYearOf(session.performedOn);
  if (year === null || !isIndexable(session)) return;

  batch.set(
    paths.dayIndex(uid, year),
    { year, sessions: { [session.id]: toIndexRow(summariseSession(session)) } },
    { merge: true },
  );
}

/** Removes a session's row from one year. */
export function unindexSession(
  batch: WriteBatch,
  uid: string,
  sessionId: string,
  performedOn: string,
): void {
  const year = indexYearOf(performedOn);
  if (year === null) return;

  batch.set(
    paths.dayIndex(uid, year),
    { sessions: { [sessionId]: deleteField() } },
    { merge: true },
  );
}

/**
 * Moves a session that has changed date.
 *
 * Within one year the row is simply rewritten. Across a year boundary — a
 * session re-dated from January back into December — the old row has to be
 * removed as well, or the same session is counted in both years.
 */
export function reindexSession(
  batch: WriteBatch,
  uid: string,
  session: Session,
  previousPerformedOn: string,
): void {
  const before = indexYearOf(previousPerformedOn);
  const after = indexYearOf(session.performedOn);
  if (before !== null && before !== after) {
    unindexSession(batch, uid, session.id, previousPerformedOn);
  }
  indexSession(batch, uid, session);
}

/** Firestore caps a batch at 500 writes; one per year is nowhere near it. */
const REBUILD_WINDOW = 5000;

export type RebuildResult = { sessions: number; years: number };

/**
 * Builds the whole index from the sessions themselves.
 *
 * Run once per account, and again whenever `DAY_INDEX_VERSION` moves. It is
 * the expensive read the index exists to avoid — which is the point: paying it
 * once is what makes every calendar open afterwards four small documents.
 *
 * Each year is written whole rather than merged, so a rebuild also clears rows
 * for sessions that are no longer there. `setDayIndexVersion` is written last,
 * so an interrupted rebuild runs again rather than being recorded as done.
 */
export async function rebuildDayIndex(uid: string): Promise<RebuildResult> {
  const snapshot = await getDocsFromServer(
    query(paths.sessions(uid), orderBy('performedOn', 'desc'), limit(REBUILD_WINDOW)),
  );

  const summaries: DaySummary[] = [];
  for (const document of snapshot.docs) {
    const session = toSession(document.id, document.data());
    if (isIndexable(session)) summaries.push(summariseSession(session));
  }

  const years = byIndexYear(summaries);
  const batch = writeBatch(db);
  for (const [year, rows] of years) {
    const sessions: Record<string, unknown> = {};
    for (const [sessionId, summary] of rows) sessions[sessionId] = toIndexRow(summary);
    batch.set(paths.dayIndex(uid, year), { year, sessions });
  }
  await batch.commit();

  await setDayIndexVersion(uid, DAY_INDEX_VERSION);
  return { sessions: summaries.length, years: years.size };
}
