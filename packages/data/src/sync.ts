/**
 * Sync state, gathered from the listeners the app already has open.
 *
 * Firestore has no "am I in sync?" API, and it is right not to: sync is per
 * document, and the only honest answer is the union of what every live
 * listener currently reports. So each hook reports its own snapshot metadata
 * here (§2.8) and this module keeps the tally.
 *
 * That makes the reading *scoped to what is on screen*, which is worth saying
 * plainly: a write queued on a screen you have since left is still queued, but
 * once nothing is listening to that document the chip cannot see it. Firestore
 * flushes it regardless — the cache is the queue, not this store. What this
 * drives is a status chip, never a gate: nothing in the app waits on it, and
 * no write is held back because of it.
 *
 * A plain module-level store rather than context: hooks report from inside
 * snapshot callbacks, which are not React events, and threading a provider
 * through every one of them would buy nothing but ceremony.
 */

type Report = {
  /** A local write this listener can see that the server has not acked. */
  pending: boolean;
  /** The snapshot was served from cache, so the server has not answered yet. */
  fromCache: boolean;
};

const reports = new Map<string, Report>();
const subscribers = new Set<() => void>();

export type SyncState = {
  /** Something is written locally and not yet acknowledged by the server. */
  pending: boolean;
  /** Every open listener is answering from cache — nothing has reached us. */
  offline: boolean;
  /** When the last pending write cleared, or null if none has this session. */
  syncedAt: number | null;
  /** No listener is reporting yet, so there is nothing to say. */
  idle: boolean;
};

let state: SyncState = { pending: false, offline: false, syncedAt: null, idle: true };

function recompute(): void {
  const all = [...reports.values()];
  const pending = all.some((report) => report.pending);
  const next: SyncState = {
    pending,
    // `every` over an empty list is true, which would read as "offline" before
    // the first snapshot lands. An empty tally is `idle` instead.
    offline: all.length > 0 && all.every((report) => report.fromCache),
    // Only a fall from pending to clear is a sync. Staying clear is not an
    // event, and stamping it every snapshot would make "synced 2s ago" mean
    // "a listener fired", which is not what anyone reads it as.
    syncedAt: state.pending && !pending ? Date.now() : state.syncedAt,
    idle: all.length === 0,
  };

  if (
    next.pending === state.pending &&
    next.offline === state.offline &&
    next.syncedAt === state.syncedAt &&
    next.idle === state.idle
  ) {
    return;
  }

  state = next;
  for (const notify of subscribers) notify();
}

/**
 * Report one listener's snapshot metadata. Call from inside the snapshot
 * callback; `key` must be stable for the listener and unique across them.
 */
export function reportSync(key: string, report: Report): void {
  const previous = reports.get(key);
  if (previous?.pending === report.pending && previous.fromCache === report.fromCache) return;
  reports.set(key, report);
  recompute();
}

/** Drop a listener's report when it unsubscribes. */
export function releaseSync(key: string): void {
  if (!reports.delete(key)) return;
  recompute();
}

export function subscribeSync(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

export function syncSnapshot(): SyncState {
  return state;
}

/** Server rendering and the first paint have no listeners yet. */
export const SYNC_IDLE: SyncState = { pending: false, offline: false, syncedAt: null, idle: true };

/**
 * How long ago the last sync was, in words.
 *
 * Coarse on purpose. A second-by-second countdown invites you to watch it,
 * and the only thing anyone needs from this line is "recently" or "not for a
 * while" — the queue flushes on its own either way.
 */
export function formatSyncAge(syncedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - syncedAt) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return 'less than a minute ago';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${String(days)} day${days === 1 ? '' : 's'} ago`;
}

/** Test-only: forget every report so cases cannot leak into each other. */
export function resetSyncForTests(): void {
  reports.clear();
  state = SYNC_IDLE;
  for (const notify of subscribers) notify();
}
