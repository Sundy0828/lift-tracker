import type { LibraryLevel } from '@/domain/library';
import type { ExerciseSlot, Prescription, RepRange } from '@/domain/workouts';

/**
 * The workouts the global library ships with.
 *
 * **Seeded, not submitted.** An empty library reads as an abandoned app, and
 * the browse-and-import half is most of the value for a fraction of the work
 * (IDEAS §3). These are written by hand and pushed with `seed-library.ts`;
 * there is no client path that adds to them.
 *
 * Every exercise id is a **bundled catalog id**, so an import needs no custom
 * exercise definitions and resolves identically in every copy of the app.
 *
 * Nothing here is a copyrighted program. They are the ordinary templates a
 * coach would sketch on paper — a push day, an upper day, a dumbbell-only day
 * — with generic names, which is also what keeps a takedown request out of the
 * picture.
 */

export type SeedSlot = {
  /** A bundled catalog id. */
  id: string;
  name: string;
  sets: number;
  reps: [number, number];
  /** Reps in reserve. Defaults to 1-2, the app's own default. */
  rir?: [number, number];
  restSeconds?: number;
  /** Free text on the row, e.g. "work up in singles". */
  loadHint?: string;
  /** Members sharing a letter run as a circuit. */
  group?: string;
};

export type SeedWorkout = {
  id: string;
  name: string;
  summary: string;
  level: LibraryLevel;
  daysPerWeek: number | null;
  tags: string[];
  equipment: string[];
  slots: readonly SeedSlot[];
};

const HEAVY: [number, number] = [4, 6];
const STRENGTH: [number, number] = [5, 8];
const HYPERTROPHY: [number, number] = [8, 12];
const PUMP: [number, number] = [12, 15];

/**
 * The three lifts a powerlifting total is made of, in contest order.
 *
 * Shared by every club entry, because the workout is identical — only the
 * number you are chasing changes, and that lives in the summary. Five singles
 * is a ramp, not five maxes: the first four are the warm-up you would do
 * anyway, logged so the overlay can see them.
 */
const CLUB_LIFTS: readonly SeedSlot[] = [
  {
    id: 'Barbell_Squat',
    name: 'Barbell Squat',
    sets: 5,
    reps: [1, 1],
    rir: [0, 0],
    restSeconds: 300,
    loadHint: 'Work up in singles to the best you have today',
  },
  {
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    name: 'Barbell Bench Press - Medium Grip',
    sets: 5,
    reps: [1, 1],
    rir: [0, 0],
    restSeconds: 300,
    loadHint: 'Work up in singles; a spotter for the last two',
  },
  {
    id: 'Barbell_Deadlift',
    name: 'Barbell Deadlift',
    sets: 4,
    reps: [1, 1],
    rir: [0, 0],
    restSeconds: 300,
    loadHint: 'Work up in singles; stop when the bar slows',
  },
];

export const SEED_LIBRARY: readonly SeedWorkout[] = [
  {
    id: 'ppl-push',
    name: 'Push — chest, shoulders, triceps',
    summary: 'The push day of a push/pull/legs split. One heavy press, then volume.',
    level: 'intermediate',
    daysPerWeek: 6,
    tags: ['push-pull-legs', 'gym', 'upper body'],
    equipment: ['barbell', 'dumbbell', 'cable'],
    slots: [
      {
        id: 'Barbell_Bench_Press_-_Medium_Grip',
        name: 'Barbell Bench Press - Medium Grip',
        sets: 4,
        reps: STRENGTH,
        restSeconds: 180,
      },
      {
        id: 'Standing_Military_Press',
        name: 'Standing Military Press',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 150,
      },
      { id: 'Incline_Dumbbell_Press', name: 'Incline Dumbbell Press', sets: 3, reps: HYPERTROPHY },
      { id: 'Cable_Crossover', name: 'Cable Crossover', sets: 3, reps: PUMP, restSeconds: 60 },
      {
        id: 'Side_Lateral_Raise',
        name: 'Side Lateral Raise',
        sets: 3,
        reps: PUMP,
        restSeconds: 60,
      },
      {
        id: 'Triceps_Pushdown_-_Rope_Attachment',
        name: 'Triceps Pushdown - Rope Attachment',
        sets: 3,
        reps: PUMP,
        restSeconds: 60,
      },
    ],
  },
  {
    id: 'ppl-pull',
    name: 'Pull — back and biceps',
    summary: 'Vertical and horizontal pulling, then arms. Pairs with the push day.',
    level: 'intermediate',
    daysPerWeek: 6,
    tags: ['push-pull-legs', 'gym', 'upper body'],
    equipment: ['barbell', 'dumbbell', 'cable'],
    slots: [
      { id: 'Chin-Up', name: 'Chin-Up', sets: 4, reps: STRENGTH, restSeconds: 150 },
      {
        id: 'Bent_Over_Barbell_Row',
        name: 'Bent Over Barbell Row',
        sets: 4,
        reps: HYPERTROPHY,
        restSeconds: 150,
      },
      { id: 'Seated_Cable_Rows', name: 'Seated Cable Rows', sets: 3, reps: HYPERTROPHY },
      { id: 'Face_Pull', name: 'Face Pull', sets: 3, reps: PUMP, restSeconds: 60 },
      { id: 'Barbell_Curl', name: 'Barbell Curl', sets: 3, reps: HYPERTROPHY, restSeconds: 60 },
      { id: 'Hammer_Curls', name: 'Hammer Curls', sets: 3, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'ppl-legs',
    name: 'Legs — quads, hamstrings, calves',
    summary: 'A squat, a hinge, and enough single-joint work to finish the job.',
    level: 'intermediate',
    daysPerWeek: 6,
    tags: ['push-pull-legs', 'gym', 'lower body'],
    equipment: ['barbell', 'machine'],
    slots: [
      { id: 'Barbell_Squat', name: 'Barbell Squat', sets: 4, reps: STRENGTH, restSeconds: 210 },
      {
        id: 'Romanian_Deadlift',
        name: 'Romanian Deadlift',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 150,
      },
      { id: 'Leg_Press', name: 'Leg Press', sets: 3, reps: HYPERTROPHY },
      { id: 'Lying_Leg_Curls', name: 'Lying Leg Curls', sets: 3, reps: PUMP, restSeconds: 60 },
      {
        id: 'Standing_Calf_Raises',
        name: 'Standing Calf Raises',
        sets: 4,
        reps: PUMP,
        restSeconds: 60,
      },
      { id: 'Hanging_Leg_Raise', name: 'Hanging Leg Raise', sets: 3, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'upper-a',
    name: 'Upper A — press-led',
    summary: 'Half of an upper/lower split. Bench and row lead; the rest is accessory.',
    level: 'intermediate',
    daysPerWeek: 4,
    tags: ['upper-lower', 'gym', 'upper body'],
    equipment: ['barbell', 'dumbbell', 'cable'],
    slots: [
      {
        id: 'Barbell_Bench_Press_-_Medium_Grip',
        name: 'Barbell Bench Press - Medium Grip',
        sets: 4,
        reps: HEAVY,
        restSeconds: 210,
      },
      {
        id: 'Bent_Over_Barbell_Row',
        name: 'Bent Over Barbell Row',
        sets: 4,
        reps: STRENGTH,
        restSeconds: 150,
      },
      {
        id: 'Dumbbell_One-Arm_Shoulder_Press',
        name: 'Dumbbell One-Arm Shoulder Press',
        sets: 3,
        reps: HYPERTROPHY,
      },
      { id: 'Wide-Grip_Lat_Pulldown', name: 'Wide-Grip Lat Pulldown', sets: 3, reps: HYPERTROPHY },
      { id: 'Triceps_Pushdown', name: 'Triceps Pushdown', sets: 3, reps: PUMP, restSeconds: 60 },
      {
        id: 'Dumbbell_Bicep_Curl',
        name: 'Dumbbell Bicep Curl',
        sets: 3,
        reps: PUMP,
        restSeconds: 60,
      },
    ],
  },
  {
    id: 'upper-b',
    name: 'Upper B — pull-led',
    summary: 'The other upper day. Vertical pulling first, pressing second.',
    level: 'intermediate',
    daysPerWeek: 4,
    tags: ['upper-lower', 'gym', 'upper body'],
    equipment: ['barbell', 'dumbbell', 'cable'],
    slots: [
      { id: 'Chin-Up', name: 'Chin-Up', sets: 4, reps: STRENGTH, restSeconds: 180 },
      {
        id: 'Barbell_Shoulder_Press',
        name: 'Barbell Shoulder Press',
        sets: 4,
        reps: STRENGTH,
        restSeconds: 150,
      },
      { id: 'Incline_Dumbbell_Press', name: 'Incline Dumbbell Press', sets: 3, reps: HYPERTROPHY },
      { id: 'One-Arm_Dumbbell_Row', name: 'One-Arm Dumbbell Row', sets: 3, reps: HYPERTROPHY },
      { id: 'Reverse_Flyes', name: 'Reverse Flyes', sets: 3, reps: PUMP, restSeconds: 60 },
      { id: 'Hammer_Curls', name: 'Hammer Curls', sets: 3, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'lower-a',
    name: 'Lower A — squat-led',
    summary: 'Squat heavy, hinge lighter, then accessories. Pairs with either upper day.',
    level: 'intermediate',
    daysPerWeek: 4,
    tags: ['upper-lower', 'gym', 'lower body'],
    equipment: ['barbell', 'machine'],
    slots: [
      { id: 'Barbell_Squat', name: 'Barbell Squat', sets: 4, reps: HEAVY, restSeconds: 210 },
      {
        id: 'Romanian_Deadlift',
        name: 'Romanian Deadlift',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 150,
      },
      { id: 'Leg_Extensions', name: 'Leg Extensions', sets: 3, reps: PUMP, restSeconds: 60 },
      { id: 'Seated_Leg_Curl', name: 'Seated Leg Curl', sets: 3, reps: PUMP, restSeconds: 60 },
      {
        id: 'Standing_Calf_Raises',
        name: 'Standing Calf Raises',
        sets: 4,
        reps: PUMP,
        restSeconds: 60,
      },
    ],
  },
  {
    id: 'lower-b',
    name: 'Lower B — hinge-led',
    summary: 'Deadlift first, then unilateral work. Harder on the back than Lower A.',
    level: 'intermediate',
    daysPerWeek: 4,
    tags: ['upper-lower', 'gym', 'lower body'],
    equipment: ['barbell', 'dumbbell'],
    slots: [
      { id: 'Barbell_Deadlift', name: 'Barbell Deadlift', sets: 3, reps: HEAVY, restSeconds: 240 },
      {
        id: 'Barbell_Hip_Thrust',
        name: 'Barbell Hip Thrust',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 150,
      },
      { id: 'Dumbbell_Lunges', name: 'Dumbbell Lunges', sets: 3, reps: HYPERTROPHY },
      { id: 'Lying_Leg_Curls', name: 'Lying Leg Curls', sets: 3, reps: PUMP, restSeconds: 60 },
      { id: 'Hanging_Leg_Raise', name: 'Hanging Leg Raise', sets: 3, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'full-body-a',
    name: 'Full body A',
    summary: 'A squat, a press and a pull in one session. The first of a three-day rotation.',
    level: 'beginner',
    daysPerWeek: 3,
    tags: ['full-body', 'beginner', 'gym'],
    equipment: ['barbell', 'cable'],
    slots: [
      { id: 'Barbell_Squat', name: 'Barbell Squat', sets: 3, reps: STRENGTH, restSeconds: 180 },
      {
        id: 'Barbell_Bench_Press_-_Medium_Grip',
        name: 'Barbell Bench Press - Medium Grip',
        sets: 3,
        reps: STRENGTH,
        restSeconds: 180,
      },
      {
        id: 'Seated_Cable_Rows',
        name: 'Seated Cable Rows',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      { id: 'Plank', name: 'Plank', sets: 3, reps: [1, 1], rir: [0, 0], restSeconds: 60 },
    ],
  },
  {
    id: 'full-body-b',
    name: 'Full body B',
    summary: 'The hinge-and-overhead day of the three-day rotation.',
    level: 'beginner',
    daysPerWeek: 3,
    tags: ['full-body', 'beginner', 'gym'],
    equipment: ['barbell', 'cable'],
    slots: [
      {
        id: 'Barbell_Deadlift',
        name: 'Barbell Deadlift',
        sets: 3,
        reps: STRENGTH,
        restSeconds: 210,
      },
      {
        id: 'Standing_Military_Press',
        name: 'Standing Military Press',
        sets: 3,
        reps: STRENGTH,
        restSeconds: 150,
      },
      {
        id: 'Wide-Grip_Lat_Pulldown',
        name: 'Wide-Grip Lat Pulldown',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      { id: 'Hanging_Leg_Raise', name: 'Hanging Leg Raise', sets: 3, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'full-body-c',
    name: 'Full body C',
    summary: 'Lighter than A and B, with more single-joint work. Closes the rotation.',
    level: 'beginner',
    daysPerWeek: 3,
    tags: ['full-body', 'beginner', 'gym'],
    equipment: ['barbell', 'dumbbell', 'machine'],
    slots: [
      {
        id: 'Front_Squat_Clean_Grip',
        name: 'Front Squat (Clean Grip)',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 150,
      },
      {
        id: 'Incline_Dumbbell_Press',
        name: 'Incline Dumbbell Press',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      {
        id: 'One-Arm_Dumbbell_Row',
        name: 'One-Arm Dumbbell Row',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      {
        id: 'Side_Lateral_Raise',
        name: 'Side Lateral Raise',
        sets: 3,
        reps: PUMP,
        restSeconds: 60,
      },
      { id: 'Barbell_Curl', name: 'Barbell Curl', sets: 2, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'dumbbell-upper',
    name: 'Dumbbell only — upper',
    summary: 'A full upper session with nothing but a pair of dumbbells and a bench.',
    level: 'beginner',
    daysPerWeek: 3,
    tags: ['dumbbell-only', 'home', 'upper body'],
    equipment: ['dumbbell'],
    slots: [
      {
        id: 'Dumbbell_Bench_Press',
        name: 'Dumbbell Bench Press',
        sets: 4,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      {
        id: 'Bent_Over_Two-Dumbbell_Row',
        name: 'Bent Over Two-Dumbbell Row',
        sets: 4,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      { id: 'Arnold_Dumbbell_Press', name: 'Arnold Dumbbell Press', sets: 3, reps: HYPERTROPHY },
      { id: 'Reverse_Flyes', name: 'Reverse Flyes', sets: 3, reps: PUMP, restSeconds: 60 },
      {
        id: 'Dumbbell_Bicep_Curl',
        name: 'Dumbbell Bicep Curl',
        sets: 3,
        reps: PUMP,
        restSeconds: 60,
      },
      { id: 'Bench_Dips', name: 'Bench Dips', sets: 3, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'dumbbell-lower',
    name: 'Dumbbell only — lower',
    summary: 'Legs with dumbbells. Heavier on reps than on load, by necessity.',
    level: 'beginner',
    daysPerWeek: 3,
    tags: ['dumbbell-only', 'home', 'lower body'],
    equipment: ['dumbbell'],
    slots: [
      { id: 'Goblet_Squat', name: 'Goblet Squat', sets: 4, reps: HYPERTROPHY, restSeconds: 120 },
      {
        id: 'Dumbbell_Lunges',
        name: 'Dumbbell Lunges',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      {
        id: 'Split_Squat_with_Dumbbells',
        name: 'Split Squat with Dumbbells',
        sets: 3,
        reps: HYPERTROPHY,
      },
      {
        id: 'Calf_Raise_On_A_Dumbbell',
        name: 'Calf Raise On A Dumbbell',
        sets: 4,
        reps: PUMP,
        restSeconds: 60,
      },
      { id: 'Russian_Twist', name: 'Russian Twist', sets: 3, reps: PUMP, restSeconds: 60 },
    ],
  },
  {
    id: 'bodyweight-full',
    name: 'Bodyweight — no equipment',
    summary: 'Nothing but the floor. Progress by adding reps, then by slowing down.',
    level: 'beginner',
    daysPerWeek: 3,
    tags: ['bodyweight', 'home', 'no equipment', 'full-body'],
    equipment: ['body only'],
    slots: [
      { id: 'Pushups', name: 'Pushups', sets: 4, reps: PUMP, restSeconds: 90 },
      {
        id: 'Bodyweight_Walking_Lunge',
        name: 'Bodyweight Walking Lunge',
        sets: 3,
        reps: PUMP,
        restSeconds: 90,
      },
      {
        id: 'Single_Leg_Glute_Bridge',
        name: 'Single Leg Glute Bridge',
        sets: 3,
        reps: PUMP,
        restSeconds: 60,
      },
      { id: 'Plank', name: 'Plank', sets: 3, reps: [1, 1], rir: [0, 0], restSeconds: 60 },
      {
        id: 'Mountain_Climbers',
        name: 'Mountain Climbers',
        sets: 3,
        reps: [20, 30],
        restSeconds: 60,
      },
    ],
  },
  {
    id: 'hotel-gym',
    name: 'Hotel gym',
    summary: 'For a rack of light dumbbells and one cable machine. Forty minutes, tops.',
    level: 'beginner',
    daysPerWeek: null,
    tags: ['travel', 'dumbbell-only', 'full-body', 'short'],
    equipment: ['dumbbell', 'cable'],
    slots: [
      { id: 'Goblet_Squat', name: 'Goblet Squat', sets: 3, reps: PUMP, restSeconds: 90 },
      {
        id: 'Dumbbell_Bench_Press',
        name: 'Dumbbell Bench Press',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 90,
      },
      {
        id: 'Seated_Cable_Rows',
        name: 'Seated Cable Rows',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 90,
      },
      {
        id: 'Side_Lateral_Raise',
        name: 'Side Lateral Raise',
        sets: 3,
        reps: PUMP,
        restSeconds: 60,
      },
      { id: 'Plank', name: 'Plank', sets: 3, reps: [1, 1], rir: [0, 0], restSeconds: 45 },
    ],
  },
  {
    id: 'twenty-minute',
    name: 'Twenty minutes',
    summary: 'Two circuits, no rest inside a round. For a day you would otherwise skip.',
    level: 'beginner',
    daysPerWeek: null,
    tags: ['short', 'circuit', 'full-body', 'home'],
    equipment: ['dumbbell', 'body only'],
    slots: [
      { id: 'Goblet_Squat', name: 'Goblet Squat', sets: 3, reps: PUMP, restSeconds: 0, group: 'a' },
      { id: 'Pushups', name: 'Pushups', sets: 3, reps: PUMP, restSeconds: 0, group: 'a' },
      {
        id: 'Bent_Over_Two-Dumbbell_Row',
        name: 'Bent Over Two-Dumbbell Row',
        sets: 3,
        reps: PUMP,
        restSeconds: 0,
        group: 'a',
      },
      {
        id: 'Dumbbell_Lunges',
        name: 'Dumbbell Lunges',
        sets: 2,
        reps: PUMP,
        restSeconds: 0,
        group: 'b',
      },
      {
        id: 'Plank',
        name: 'Plank',
        sets: 2,
        reps: [1, 1],
        rir: [0, 0],
        restSeconds: 0,
        group: 'b',
      },
    ],
  },
  {
    id: 'strength-5x5-a',
    name: 'Strength 5×5 — A',
    summary: 'Three compounds, five sets of five, long rests. Add load every session.',
    level: 'intermediate',
    daysPerWeek: 3,
    tags: ['strength', 'low-rep', 'gym', 'full-body'],
    equipment: ['barbell'],
    slots: [
      {
        id: 'Barbell_Squat',
        name: 'Barbell Squat',
        sets: 5,
        reps: [5, 5],
        rir: [1, 3],
        restSeconds: 240,
      },
      {
        id: 'Barbell_Bench_Press_-_Medium_Grip',
        name: 'Barbell Bench Press - Medium Grip',
        sets: 5,
        reps: [5, 5],
        rir: [1, 3],
        restSeconds: 240,
      },
      {
        id: 'Bent_Over_Barbell_Row',
        name: 'Bent Over Barbell Row',
        sets: 5,
        reps: [5, 5],
        rir: [1, 3],
        restSeconds: 180,
      },
    ],
  },
  {
    id: 'strength-5x5-b',
    name: 'Strength 5×5 — B',
    summary: 'The alternating day: squat again, overhead press, one heavy pull.',
    level: 'intermediate',
    daysPerWeek: 3,
    tags: ['strength', 'low-rep', 'gym', 'full-body'],
    equipment: ['barbell'],
    slots: [
      {
        id: 'Barbell_Squat',
        name: 'Barbell Squat',
        sets: 5,
        reps: [5, 5],
        rir: [1, 3],
        restSeconds: 240,
      },
      {
        id: 'Standing_Military_Press',
        name: 'Standing Military Press',
        sets: 5,
        reps: [5, 5],
        rir: [1, 3],
        restSeconds: 210,
      },
      {
        id: 'Barbell_Deadlift',
        name: 'Barbell Deadlift',
        sets: 1,
        reps: [5, 5],
        rir: [1, 3],
        restSeconds: 300,
      },
    ],
  },
  {
    id: 'arms-and-shoulders',
    name: 'Arms and shoulders',
    summary: 'A supplementary day for delts and arms, supersetted to keep it short.',
    level: 'intermediate',
    daysPerWeek: null,
    tags: ['accessory', 'circuit', 'gym', 'upper body'],
    equipment: ['dumbbell', 'cable', 'barbell'],
    slots: [
      {
        id: 'Barbell_Shoulder_Press',
        name: 'Barbell Shoulder Press',
        sets: 4,
        reps: HYPERTROPHY,
        restSeconds: 120,
      },
      {
        id: 'Side_Lateral_Raise',
        name: 'Side Lateral Raise',
        sets: 3,
        reps: PUMP,
        restSeconds: 0,
        group: 'a',
      },
      { id: 'Face_Pull', name: 'Face Pull', sets: 3, reps: PUMP, restSeconds: 0, group: 'a' },
      {
        id: 'Barbell_Curl',
        name: 'Barbell Curl',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 0,
        group: 'b',
      },
      {
        id: 'Triceps_Pushdown_-_Rope_Attachment',
        name: 'Triceps Pushdown - Rope Attachment',
        sets: 3,
        reps: HYPERTROPHY,
        restSeconds: 0,
        group: 'b',
      },
    ],
  },
  {
    id: 'core-and-carry',
    name: 'Core and carries',
    summary: 'Fifteen minutes of trunk work to bolt onto the end of any session.',
    level: 'beginner',
    daysPerWeek: null,
    tags: ['accessory', 'core', 'short'],
    equipment: ['cable', 'body only', 'dumbbell'],
    slots: [
      { id: 'Hanging_Leg_Raise', name: 'Hanging Leg Raise', sets: 3, reps: PUMP, restSeconds: 60 },
      { id: 'Cable_Crunch', name: 'Cable Crunch', sets: 3, reps: PUMP, restSeconds: 60 },
      { id: 'Plank', name: 'Plank', sets: 3, reps: [1, 1], rir: [0, 0], restSeconds: 45 },
      {
        id: 'Farmers_Walk',
        name: "Farmer's Walk",
        sets: 3,
        reps: [1, 1],
        rir: [0, 0],
        restSeconds: 90,
      },
    ],
  },
  {
    id: 'the-total-club',
    name: 'Join the club',
    summary:
      'Squat, bench and deadlift, worked up to a heavy single. Add the three for your total — 500, 750, 1000, 1250.',
    level: 'intermediate',
    daysPerWeek: null,
    tags: ['total', 'test day', 'powerlifting', 'gym'],
    equipment: ['barbell'],
    slots: CLUB_LIFTS,
  },
  {
    id: 'deload-week',
    name: 'Deload — full body',
    summary: 'Half the sets, well short of failure. For the week after a hard block.',
    level: 'intermediate',
    daysPerWeek: 3,
    tags: ['deload', 'recovery', 'full-body', 'gym'],
    equipment: ['barbell', 'cable'],
    slots: [
      {
        id: 'Barbell_Squat',
        name: 'Barbell Squat',
        sets: 2,
        reps: STRENGTH,
        rir: [4, 5],
        restSeconds: 180,
      },
      {
        id: 'Barbell_Bench_Press_-_Medium_Grip',
        name: 'Barbell Bench Press - Medium Grip',
        sets: 2,
        reps: STRENGTH,
        rir: [4, 5],
        restSeconds: 180,
      },
      {
        id: 'Seated_Cable_Rows',
        name: 'Seated Cable Rows',
        sets: 2,
        reps: HYPERTROPHY,
        rir: [4, 5],
        restSeconds: 120,
      },
      { id: 'Face_Pull', name: 'Face Pull', sets: 2, reps: PUMP, rir: [4, 5], restSeconds: 60 },
    ],
  },
];

const DEFAULT_RIR: RepRange = { min: 1, max: 2 };

function prescriptionOf(slot: SeedSlot): Prescription {
  return {
    sets: slot.sets,
    repRange: { min: slot.reps[0], max: slot.reps[1] },
    rirRange: slot.rir === undefined ? DEFAULT_RIR : { min: slot.rir[0], max: slot.rir[1] },
    restSeconds: slot.restSeconds ?? null,
    loadHint: slot.loadHint ?? null,
  };
}

/**
 * The seed rows as the app's own slot shape.
 *
 * Slot ids are derived from the workout id and the position rather than being
 * random, so re-running the seed writes the same document instead of a
 * different one that happens to look the same.
 */
export function seedSlots(workout: SeedWorkout): ExerciseSlot[] {
  const occurrences = new Map<string, number>();

  return workout.slots.map((slot, index) => {
    const used = occurrences.get(slot.id) ?? 0;
    occurrences.set(slot.id, used + 1);

    return {
      slotId: `${workout.id}-${String(index)}`,
      kind: 'exercise',
      exerciseId: slot.id,
      exerciseName: slot.name,
      occurrenceIndex: used,
      prescription: prescriptionOf(slot),
      supersetGroup: slot.group === undefined ? null : `${workout.id}-${slot.group}`,
      notes: '',
    };
  });
}

/** Rest after a whole circuit round, keyed by superset group. */
export function seedGroupRest(workout: SeedWorkout): Record<string, number | null> {
  const rest: Record<string, number | null> = {};
  for (const slot of workout.slots) {
    if (slot.group === undefined) continue;
    rest[`${workout.id}-${slot.group}`] = 120;
  }
  return rest;
}
