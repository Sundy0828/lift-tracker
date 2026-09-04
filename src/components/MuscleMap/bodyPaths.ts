import type { BaseMuscleGroup, MuscleGroup } from '@/domain/muscles';
import { isBaseMuscleGroup } from '@/domain/muscles';

/**
 * Hand-authored front/back body diagrams, one path per base muscle group.
 * Each path may hold several subpaths, so a bilateral muscle is still a single
 * `<path data-muscle>` and the heat map sets one fill per muscle.
 *
 * Deliberately stylised rather than anatomical: the diagram is decorative and
 * the readout table is the real content, so reading clearly at thumb size
 * matters more than precision. Regions are drawn to share edges — a gap
 * between two muscles reads as a hole in the body, not as a joint.
 *
 * Both views share a 120x300 viewBox and are symmetric about x = 60, so a
 * right-side path is its left-side twin with every x replaced by 120 - x.
 */

export type BodyView = 'front' | 'back';

/** Non-muscle parts: head, hands, feet. Rendered in a flat neutral tone. */
const OUTLINE =
  // head
  'M60 8 a14 14 0 0 1 14 14 a14 14 0 0 1 -14 14 a14 14 0 0 1 -14 -14 a14 14 0 0 1 14 -14 Z ' +
  // hands, continuing straight off the forearms
  'M24 145 l11 1 -1 15 -9 0 Z M96 145 l-11 1 1 15 9 0 Z ' +
  // feet
  'M46 256 l11 1 1 13 -14 0 Z M74 256 l-11 1 -1 13 14 0 Z';

/**
 * A drawn region may be a base group or one of the finer extensions. Anything
 * drawn here gets its own shading; anything not drawn shades its parent
 * instead (see `heatByRegion`). That is the hook for splitting a region later
 * — give front/side/rear delts their own paths and the math follows.
 */
export const FRONT_PATHS: Partial<Record<MuscleGroup, string>> = {
  neck: 'M53 33 h14 v13 l-7 3 -7-3 Z',

  traps: 'M44 47 l16-3 16 3 -5 10 -11-3 -11 3 Z',

  shoulders: 'M44 48 l-10 3 -8 13 1 10 12 2 6-13 Z ' + 'M76 48 l10 3 8 13 -1 10 -12 2 -6-13 Z',

  chest: 'M45 57 l15-2 0 28 -11 3 -6-13 Z ' + 'M75 57 l-15-2 0 28 11 3 6-13 Z',

  abdominals: 'M51 87 h18 l-1 35 h-16 Z',

  // Flanks, filling the gap between abs and the outer torso edge.
  obliques: 'M44 85 l6 2 -1 33 -7-9 Z M76 85 l-6 2 1 33 7-9 Z',

  biceps: 'M28 70 l11 3 2 31 -11 2 -5-21 Z M92 70 l-11 3 -2 31 11 2 5-21 Z',

  forearms: 'M26 103 l12 2 -3 41 -11 0 Z M94 103 l-12 2 3 41 11 0 Z',

  // Outer hip, meeting the quads at the thigh edge.
  abductors: 'M42 121 l8 3 0 20 -10-7 Z M78 121 l-8 3 0 20 10-7 Z',

  // Inner thigh, between the two quads.
  adductors: 'M53 124 h7 l0 38 -10-6 Z M67 124 h-7 l0 38 10-6 Z',

  quadriceps: 'M45 123 l14 2 -1 68 -14-2 Z M75 123 l-14 2 1 68 14-2 Z',

  calves: 'M46 192 l12 1 -1 64 -11-1 Z M74 192 l-12 1 1 64 11-1 Z',
};

export const BACK_PATHS: Partial<Record<MuscleGroup, string>> = {
  neck: 'M53 33 h14 v13 l-7 3 -7-3 Z',

  // Traps dominate the upper back, so they run further down this view.
  traps: 'M44 46 l16-3 16 3 -4 24 -12 5 -12-5 Z',

  shoulders: 'M44 48 l-10 3 -8 13 1 10 12 2 6-13 Z ' + 'M76 48 l10 3 8 13 -1 10 -12 2 -6-13 Z',

  // Wrapping from under the armpit in to the waist.
  lats: 'M44 74 l15 7 -2 27 -15-9 Z M76 74 l-15 7 2 27 15-9 Z',

  // The rhomboid area between the shoulder blades.
  'middle back': 'M50 73 h20 l-2 21 h-16 Z',

  'lower back': 'M49 94 h22 l-2 28 h-18 Z',

  triceps: 'M28 70 l11 3 2 31 -11 2 -5-21 Z M92 70 l-11 3 -2 31 11 2 5-21 Z',

  forearms: 'M26 103 l12 2 -3 41 -11 0 Z M94 103 l-12 2 3 41 11 0 Z',

  glutes: 'M44 121 l16 3 0 26 -15-5 Z M76 121 l-16 3 0 26 15-5 Z',

  hamstrings: 'M46 147 l13 3 -1 42 -13-2 Z M74 147 l-13 3 1 42 13-2 Z',

  calves: 'M46 192 l12 1 -1 64 -11-1 Z M74 192 l-12 1 1 64 11-1 Z',
};

export const VIEW_BOX = '0 0 120 300';

export function pathsFor(view: BodyView): Partial<Record<MuscleGroup, string>> {
  return view === 'front' ? FRONT_PATHS : BACK_PATHS;
}

/** Both views share one outline; the parameter keeps the call sites uniform. */
export function outlineFor(view: BodyView): string {
  return view === 'front' ? OUTLINE : OUTLINE;
}

/** Every region drawn on at least one view; a test asserts full coverage. */
export const DRAWN_MUSCLES: readonly MuscleGroup[] = [
  ...new Set([
    ...(Object.keys(FRONT_PATHS) as MuscleGroup[]),
    ...(Object.keys(BACK_PATHS) as MuscleGroup[]),
  ]),
];

/** Set form, for `heatByRegion`. */
export const DRAWN_MUSCLE_SET: ReadonlySet<MuscleGroup> = new Set(DRAWN_MUSCLES);

/** The drawn regions that are base groups; a test asserts all 17 are here. */
export const DRAWN_BASE_MUSCLES: readonly BaseMuscleGroup[] =
  DRAWN_MUSCLES.filter(isBaseMuscleGroup);
