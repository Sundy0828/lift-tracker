import { useMemo } from 'react';
import type { LoadScaleOf } from '@lift/domain/strength';
import { loadScaleLookup } from '@lift/domain/strength';
import { useExerciseLibrary } from './useExerciseLibrary';

export type LoadScaleState = {
  /** Each exercise id's scoring scale (see `LoadScale`). */
  scaleOf: LoadScaleOf;
  /**
   * True until the catalog and custom exercises are in. Until then every
   * exercise reads as `external`, so a caller that *writes* a score (finishing
   * a session, deleting one) should wait for this rather than store a record
   * on the wrong scale.
   *
   * False again if the catalog failed to load: a workout that cannot be
   * finished is worse than a record scored on the old rule, and
   * `rebuild-records` can put that right later.
   */
  isPending: boolean;
};

/**
 * Adapts the exercise library into the shape the strength math needs, so the
 * record and comparison code stays a pure function over plain data — the same
 * arrangement as `useMuscleLookup`.
 */
export function useLoadScale(): LoadScaleState {
  const { resolver, isPending, error } = useExerciseLibrary();
  const scaleOf = useMemo(() => loadScaleLookup(resolver), [resolver]);
  return { scaleOf, isPending: isPending && error === null };
}
