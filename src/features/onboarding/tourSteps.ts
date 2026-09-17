/**
 * What a first-time user is told, and in what order.
 *
 * Six steps, because a tour nobody finishes teaches nothing. Each one is
 * either **the model** — the two or three ideas the rest of the app only makes
 * sense against — or **a gesture that has no button**, which is the only kind
 * of thing that genuinely cannot be discovered by looking.
 *
 * Deliberately not a tour of the navigation. Four tabs with labels on them do
 * not need explaining, and spending a step on them is how people learn to skip
 * the next one.
 */

export type TourStep = {
  /** Short, and a statement rather than a heading. */
  title: string;
  /** One or two sentences. Read once, so it has to land the first time. */
  body: string;
  /** Concrete things to try, kept to what fits on a phone. */
  points?: readonly string[];
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'A workout is a list you reuse',
    body: 'PUSH, PULL, ABS — each one a named list of exercises with sets and rep ranges. You build it once and start it whenever you like.',
    points: [
      'A session is one performance of one workout, stamped with the day you did it.',
      'Doing PUSH and then ABS is two sessions, which is what keeps each one’s history clean.',
    ],
  },
  {
    title: 'Publish a version before you use it',
    body: 'Publishing freezes the workout as it stands, and a session records which version it was performed against. Edit the workout later and last month still reads correctly.',
    points: ['Workouts → New → add exercises → Publish v1.'],
  },
  {
    title: 'Logging is two numbers and a tick',
    body: 'Type the weight and the reps. Once a set holds everything it asks for it ticks itself and the rest timer starts.',
    points: [
      'The bar above the navigation counts down; −15s and +15s adjust it, Skip ends it.',
      'A rest that runs out keeps counting upwards, so you can see how long you actually took.',
      'It buzzes when it ends — and notifies you if the screen is off.',
    ],
  },
  {
    title: 'Two things on a set row have no button',
    body: 'Both are on the row itself, and both are easy to miss.',
    points: [
      'Tap the set number to mark it a warmup. Warmups are logged but never compared or counted as a record.',
      'Tap “skip” at the end of the row for a set you did not do. The row stays, so the gap is visible next time.',
      '“How to” opens the instructions over the session — the timer stays running and comes with it.',
    ],
  },
  {
    title: 'Last time’s numbers, from this workout only',
    body: 'Each set shows what you did in the same position last time you performed this workout, with a coloured chip for how it compares.',
    points: [
      'Green is up, red is down, blue is unchanged — measured on estimated 1RM, so more weight for fewer reps resolves properly.',
      'The same lift on a different day is never used: it happens at a different point of a different session, so it is not a comparison.',
    ],
  },
  {
    title: 'Circuits are made by dragging',
    body: 'In the workout editor, hold one exercise over another to join them into a circuit. Drag a member out of the block to leave, or swipe it right.',
    points: [
      'Swipe a row left to delete it.',
      'When you are ready for more: a weekly plan, a library to copy workouts from, a calendar of what you have done, and an export of all of it.',
    ],
  },
];

/**
 * Bumped when the steps change enough to be worth showing again.
 *
 * Stored on the profile rather than on the device, so the tour follows the
 * account: signing in on a phone after setting the app up on a laptop should
 * not start it over.
 */
export const TOUR_VERSION = 1;
