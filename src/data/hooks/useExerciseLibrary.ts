import { useEffect, useMemo, useState } from 'react';
import { loadCatalog } from '@/catalog';
import type { CatalogExercise, ExerciseResolver } from '@/domain/exercises';
import { createExerciseResolver } from '@/domain/exercises';
import type { SearchIndex } from '@/domain/search';
import { buildSearchIndex } from '@/domain/search';
import { useCustomExercises } from './useCustomExercises';

export type ExerciseLibrary = {
  /** Resolves an id to one `Exercise`, custom entries shadowing the catalog. */
  resolver: ExerciseResolver;
  /** Prefix-token index over the merged list, ready for search(). */
  index: SearchIndex;
  isPending: boolean;
  /** Non-null when the catalog could not be loaded at all. */
  error: string | null;
};

const EMPTY_CATALOG: readonly CatalogExercise[] = [];

/**
 * The app's single entry point for exercise data: the bundled catalog merged
 * with the user's custom exercises (§2.2).
 *
 * The index is rebuilt when either source changes. That costs a couple of
 * milliseconds for ~900 entries, which is cheap enough to not warrant
 * incremental updates.
 */
export function useExerciseLibrary(): ExerciseLibrary {
  const { exercises: custom, isPending: customPending } = useCustomExercises();
  const [catalog, setCatalog] = useState<readonly CatalogExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadCatalog().then(
      (loaded) => {
        if (!cancelled) setCatalog(loaded);
      },
      (cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the exercise catalog');
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const resolver = useMemo(
    () => createExerciseResolver(catalog ?? EMPTY_CATALOG, custom),
    [catalog, custom],
  );

  const index = useMemo(() => buildSearchIndex(resolver.all()), [resolver]);

  return {
    resolver,
    index,
    isPending: catalog === null || customPending,
    error,
  };
}
