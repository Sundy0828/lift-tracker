import type { MuscleGroup } from '@lift/domain/muscles';
import { MUSCLE_GROUPS_BY_REGION } from '@lift/domain/muscles';

/** Every muscle of one display region. Empty for `null`, which matches all of them. */
export function musclesInRegion(region: string | null): readonly MuscleGroup[] {
  return MUSCLE_GROUPS_BY_REGION.find((entry) => entry.region === region)?.muscles ?? [];
}
