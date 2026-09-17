import { getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { LibraryWorkout } from '@/domain/library';
import { parseLibraryWorkout } from '@/domain/library';
import { paths } from '../paths';

export type LibraryState = {
  entries: readonly LibraryWorkout[];
  isPending: boolean;
  /** Set when the collection could not be read at all. */
  error: string | null;
};

/**
 * The seeded global library.
 *
 * A **one-shot read, not a listener**, and shared across every mount: the
 * library only changes when it is re-seeded, so a live subscription would hold
 * a listener open on a public collection for the life of the tab and deliver
 * nothing. The promise is memoised for the session, like the exercise catalog.
 *
 * It needs no signed-in user — the rules make it world-readable — so this hook
 * does not wait on auth.
 */
let pending: Promise<LibraryWorkout[]> | null = null;

function loadLibrary(): Promise<LibraryWorkout[]> {
  pending ??= getDocs(paths.library())
    .then((snapshot) => {
      const entries: LibraryWorkout[] = [];
      for (const document of snapshot.docs) {
        const parsed = parseLibraryWorkout(document.id, document.data());
        if (parsed !== null) entries.push(parsed);
      }
      return entries;
    })
    .catch((error: unknown) => {
      // Cleared so a transient failure can be retried by the next mount.
      pending = null;
      throw error;
    });
  return pending;
}

export function useLibrary(): LibraryState {
  const [state, setState] = useState<LibraryState>({
    entries: [],
    isPending: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    loadLibrary().then(
      (entries) => {
        if (!cancelled) setState({ entries, isPending: false, error: null });
      },
      () => {
        if (!cancelled) {
          setState({
            entries: [],
            isPending: false,
            error: 'The library could not be loaded. It needs a connection the first time.',
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
