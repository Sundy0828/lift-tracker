import type { BaseMuscleGroup, ExtendedMuscleGroup } from '@/domain/muscles';

/**
 * Curated refinements applied to the vendored catalog (§2.3 note).
 *
 * free-exercise-db's vocabulary is too coarse in a few places that matter for
 * training decisions: every rear-delt movement is tagged `shoulders`, every
 * side bend is `abdominals`. This table refines those cases by name pattern so
 * the muscle map and volume readout can tell them apart.
 *
 * This *is* the mapping layer §2.3 set out to avoid, so it is kept deliberately
 * narrow and honest:
 *
 * - **Replacements only.** Each rule swaps one base muscle for a strictly more
 *   precise child of that same base group, so no volume moves between regions
 *   and nothing can be double counted. Cases that would need an *addition*
 *   (a hanging leg raise is abs *and* hip flexors) are left alone rather than
 *   guessed at.
 * - **Committed and re-applied on every refresh**, so `catalog:update` is
 *   still a one-command operation.
 * - **Asserted by tests**, so a rule that stops matching upstream fails the
 *   build instead of silently going stale.
 *
 * A rule only fires when `from` is actually present, and only on the exercise
 * whose *name* matches — never on a whole muscle group.
 */
export type Refinement = {
  readonly from: BaseMuscleGroup;
  readonly to: ExtendedMuscleGroup;
  readonly pattern: RegExp;
  /** Guards against a rule silently going stale after an upstream refresh. */
  readonly expectAtLeast: number;
};

export const REFINEMENTS: readonly Refinement[] = [
  // Must precede the side-delt rule: "Rear Lateral Raise" is a rear-delt
  // movement, and once this rule has replaced `shoulders` the side-delt rule
  // no longer has anything to match.
  {
    from: 'shoulders',
    to: 'rear delts',
    pattern:
      /rear[- ]delt|rear[- ]lateral|reverse fly|rear[- ]fly|bent[- ]over.*(lateral|fly)|face pull/iu,
    expectAtLeast: 5,
  },
  {
    from: 'shoulders',
    to: 'side delts',
    pattern: /lateral raise|side lateral|side delt/iu,
    expectAtLeast: 5,
  },
  { from: 'shoulders', to: 'front delts', pattern: /front raise|front delt/iu, expectAtLeast: 3 },
  {
    from: 'abdominals',
    to: 'obliques',
    pattern: /oblique|side bend|side crunch|windmill|russian twist/iu,
    expectAtLeast: 8,
  },
  { from: 'calves', to: 'soleus', pattern: /seated calf/iu, expectAtLeast: 2 },
  // Only the anterior tibialis. "Posterior Tibialis" is a deep posterior
  // muscle and correctly stays with the calves.
  {
    from: 'calves',
    to: 'tibialis',
    pattern: /anterior tibialis|tibialis anterior/iu,
    expectAtLeast: 1,
  },
  { from: 'biceps', to: 'brachialis', pattern: /hammer curl|brachialis/iu, expectAtLeast: 4 },
  { from: 'chest', to: 'upper chest', pattern: /incline/iu, expectAtLeast: 8 },
];

/** Applies the table to one muscle list, returning it unchanged if no rule fires. */
export function refineMuscles<T extends string>(
  name: string,
  muscles: readonly T[],
): (T | ExtendedMuscleGroup)[] {
  let result: (T | ExtendedMuscleGroup)[] = [...muscles];

  for (const rule of REFINEMENTS) {
    if (!rule.pattern.test(name)) continue;
    result = result.map((muscle) => (muscle === rule.from ? rule.to : muscle));
  }

  // A refinement can collide with a name that already lists the child.
  return [...new Set(result)];
}
