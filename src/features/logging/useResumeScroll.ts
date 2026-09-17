import { useCallback, useEffect, useRef } from 'react';
import type { SessionEntry } from '@/domain/sessions';
import { entryKey, exerciseEntries, nextUnfinishedSet, sessionProgress } from '@/domain/sessions';

/**
 * Scrolls a resumed session back to where it left off.
 *
 * A workout of fifteen exercises is several screens long, and coming back to
 * one — from the notification, from a locked phone, from another app — landed
 * at the top every time, on sets finished forty minutes ago. So the first
 * paint that has rows brings the next unfinished exercise into view.
 *
 * **Only for a resume, and only once per session.** A session with nothing
 * logged is already at its starting point, and one whose next set is the first
 * row has nowhere to go — scrolling either would move the screen out from
 * under someone who did not ask for it.
 *
 * The returned factory is stable for the life of the screen, so it does not
 * detach and re-attach every row's ref on each snapshot (§3).
 */
export type RowRef = (key: string) => (node: HTMLElement | null) => void;

/** The entry to bring into view, or null when the screen should not move. */
function resumeTarget(entries: readonly SessionEntry[]): string | null {
  if (sessionProgress(entries).completed === 0) return null;

  const target = nextUnfinishedSet(entries);
  if (target === null) return null;

  const first = exerciseEntries(entries)[0];
  if (first !== undefined && entryKey(first) === target.entryKey) return null;
  return target.entryKey;
}

export function useResumeScroll(
  sessionId: string | null,
  entries: readonly SessionEntry[] | null,
): RowRef {
  const rows = useRef(new Map<string, HTMLElement>());
  /** The session already scrolled, so a later snapshot cannot move the screen. */
  const done = useRef<string | null>(null);

  const rowRef = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node === null) rows.current.delete(key);
      else rows.current.set(key, node);
    },
    [],
  );

  useEffect(() => {
    if (sessionId === null || entries === null || done.current === sessionId) return;

    const key = resumeTarget(entries);
    if (key === null) return;

    const node = rows.current.get(key);
    if (node === undefined) return;

    done.current = sessionId;
    node.scrollIntoView({ block: 'center' });
  }, [sessionId, entries]);

  return rowRef;
}
