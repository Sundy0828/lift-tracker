import { useEffect, useMemo, useState } from 'react';
import { loadCatalog } from '@lift/catalog';
import type { CatalogExercise, CustomExercise, ExerciseResolver } from '@lift/domain/exercises';
import { createExerciseResolver } from '@lift/domain/exercises';
import type { SearchIndex } from '@lift/domain/search';
import { buildSearchIndex } from '@lift/domain/search';
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
 * The catalog once loaded, so every screen after the first starts with it
 * rather than a pending render while the (memoised) promise resolves.
 */
let loadedCatalog: readonly CatalogExercise[] | null = null;

/**
 * The resolver and search index for the last catalog and custom list seen.
 *
 * Every screen with a picker, a How to or a record used to build its own index
 * of ~900 exercises; on a phone in particular that was work on every mount.
 * The custom list is shared (one listener, one array: see `useCustomExercises`),
 * so its identity is a sound cache key, and one build serves every screen.
 */
let built: {
  catalog: readonly CatalogExercise[];
  custom: readonly CustomExercise[];
  resolver: ExerciseResolver;
  index: SearchIndex;
} | null = null;

function libraryFor(
  catalog: readonly CatalogExercise[],
  custom: readonly CustomExercise[],
): { resolver: ExerciseResolver; index: SearchIndex } {
  if (built?.catalog !== catalog || built.custom !== custom) {
    const resolver = createExerciseResolver(catalog, custom);
    built = { catalog, custom, resolver, index: buildSearchIndex(resolver.all()) };
  }
  return built;
}

/**
 * The app's single entry point for exercise data: the bundled catalog merged
 * with the user's custom exercises (§2.2).
 *
 * The index is rebuilt when either source changes, once for the whole app
 * (see `libraryFor`), rather than incrementally: ~900 entries is cheap to
 * build once, and it was only the building of it on every screen that cost.
 */
export function useExerciseLibrary(): ExerciseLibrary {
  const { exercises: custom, isPending: customPending } = useCustomExercises();
  const [catalog, setCatalog] = useState<readonly CatalogExercise[] | null>(loadedCatalog);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (catalog !== null) return;
    let cancelled = false;

    loadCatalog().then(
      (loaded) => {
        loadedCatalog = loaded;
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
  }, [catalog]);

  const { resolver, index } = useMemo(
    () => libraryFor(catalog ?? EMPTY_CATALOG, custom),
    [catalog, custom],
  );

  return {
    resolver,
    index,
    isPending: catalog === null || customPending,
    error,
  };
}
