import { useCallback, useEffect, useRef, useState } from 'react';
import { saveSessionEntries } from '@/data/mutations/sessions';
import type { Session, SessionEntry } from '@/domain/sessions';

/**
 * The set grid's working copy, and the debounced write behind it.
 *
 * Unlike the workout editor — which writes every edit straight through and
 * re-renders from Firestore's cache — the log screen keeps a local copy. Two
 * reasons:
 *
 * - **Writes are debounced (§2.8).** Entering a weight, reps and RIR for one
 *   set is three commits within a couple of seconds; write-through would be
 *   three document writes, and a whole session a hundred or more. Debounced it
 *   is about one write per set — but something has to hold the value in the
 *   meantime, and that is this.
 * - The whole `entries` array goes with each write, because Firestore cannot
 *   patch a single element of an array. One user on one device has no merge
 *   conflict to design around, which is what makes that safe.
 *
 * `apply` is **stable for the life of the screen** — it reads the current
 * entries from a ref rather than closing over them — which is what lets the
 * set rows be memoized, so a keystroke cannot re-render its siblings (§3).
 */

/** Long enough to swallow a burst of taps, short enough to survive a crash. */
const DEBOUNCE_MS = 500;

export type SessionDraft = {
  entries: readonly SessionEntry[];
  /** Applies a pure change and schedules the write. */
  apply: (change: (entries: readonly SessionEntry[]) => SessionEntry[]) => void;
  /** The entries as they are right now, for a handler that needs to read them. */
  read: () => readonly SessionEntry[];
  /** Writes immediately. Used before completing, and on the way out. */
  flush: () => void;
  /** True while an edit has not yet been written. */
  isDirty: boolean;
};

export function useSessionDraft(uid: string | null, session: Session | null): SessionDraft {
  const [entries, setEntries] = useState<readonly SessionEntry[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const current = useRef<readonly SessionEntry[]>([]);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeded = useRef<string | null>(null);
  // Held in a ref so `apply` and `flush` keep their identity when the session
  // document changes, which is what makes the memoized rows work.
  const target = useRef<{ uid: string; sessionId: string } | null>(null);

  // Assigned in an effect rather than during render, and declared before the
  // seeding effect so it is always current by the time anything writes.
  useEffect(() => {
    target.current = uid === null || session === null ? null : { uid, sessionId: session.id };
  }, [uid, session]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    const to = target.current;
    if (to === null || !dirty.current) return;

    dirty.current = false;
    setIsDirty(false);
    // Not awaited: Firestore applies it to the local cache immediately and
    // flushes on reconnect.
    void saveSessionEntries(to.uid, to.sessionId, current.current);
  }, []);

  const apply = useCallback(
    (change: (entries: readonly SessionEntry[]) => SessionEntry[]) => {
      const next = change(current.current);
      current.current = next;
      setEntries(next);
      dirty.current = true;
      setIsDirty(true);

      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  const read = useCallback(() => current.current, []);

  /**
   * Seeded once per session, from the stored document.
   *
   * Deliberately not resynced on every snapshot: after the first write the
   * document and this copy say the same thing, and adopting each echo would
   * fight whatever was typed in between. Reloading re-seeds, which is what
   * makes a session interrupted by a crash recoverable.
   */
  useEffect(() => {
    if (session === null || seeded.current === session.id) return;
    seeded.current = session.id;
    current.current = session.entries;
    setEntries(session.entries);
    dirty.current = false;
    setIsDirty(false);
  }, [session]);

  /**
   * Anything pending is written on the way out. Backgrounding the app or
   * navigating away mid-set must not lose the set.
   */
  useEffect(() => {
    const onHide = (): void => {
      // `pagehide` and a hidden `visibilitychange` rather than `beforeunload`:
      // on a phone, being backgrounded is how a page actually stops running,
      // and `beforeunload` is not reliably fired for it.
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  return { entries, apply, read, flush, isDirty };
}
