import { useMemo } from 'react';
import type { MuscleLookup } from '@/domain/volume';
import { useExerciseLibrary } from './useExerciseLibrary';

export type MuscleLookupState = {
  lookup: MuscleLookup;
  isPending: boolean;
};

/**
 * Adapts the exercise library into the shape `domain/volume` needs, so the
 * volume math stays a pure function over plain data and never touches a hook.
 */
export function useMuscleLookup(): MuscleLookupState {
  const { resolver, isPending } = useExerciseLibrary();

  const lookup = useMemo<MuscleLookup>(
    () => (exerciseId) => {
      const exercise = resolver.resolve(exerciseId);
      if (exercise === null) return null;
      return {
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
      };
    },
    [resolver],
  );

  return { lookup, isPending };
}
