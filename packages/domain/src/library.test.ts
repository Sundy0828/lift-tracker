import { describe, expect, it } from 'vitest';
import type { LibraryWorkout } from './library';
import {
  asShared,
  describeSize,
  filterLibrary,
  libraryBody,
  libraryTags,
  parseLibraryWorkout,
} from './library';
import type { ExerciseSlot } from './workouts';
import { DEFAULT_PRESCRIPTION } from './workouts';

function slot(exerciseId: string, sets = 3): ExerciseSlot {
  return {
    slotId: `slot-${exerciseId}`,
    kind: 'exercise',
    exerciseId,
    exerciseName: exerciseId,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION, sets },
    supersetGroup: null,
    notes: '',
  };
}

function entry(over: Partial<LibraryWorkout> = {}): LibraryWorkout {
  return {
    id: 'ppl-push',
    name: 'Push day',
    summary: 'Chest, shoulders and triceps',
    level: 'intermediate',
    daysPerWeek: 6,
    tags: ['push-pull-legs', 'gym'],
    equipment: ['barbell'],
    slots: [slot('bench', 4), slot('press', 3)],
    groupRest: {},
    ...over,
  };
}

describe('parseLibraryWorkout', () => {
  it('reads a document the seed script writes', () => {
    const parsed = parseLibraryWorkout('ppl-push', {
      name: 'Push day',
      summary: 'Chest',
      level: 'beginner',
      daysPerWeek: 3,
      tags: ['gym', 'gym'],
      equipment: ['barbell'],
      slots: [slot('bench')],
      groupRest: {},
    });

    expect(parsed).toMatchObject({ id: 'ppl-push', name: 'Push day', level: 'beginner' });
    // Tags are de-duplicated on the way in.
    expect(parsed?.tags).toEqual(['gym']);
  });

  it('refuses an entry with nothing to import', () => {
    expect(parseLibraryWorkout('x', { name: 'Push', slots: [] })).toBeNull();
    expect(parseLibraryWorkout('x', { name: '   ', slots: [slot('bench')] })).toBeNull();
    expect(parseLibraryWorkout('x', undefined)).toBeNull();
  });

  it('falls back on a level it does not recognise', () => {
    expect(parseLibraryWorkout('x', { name: 'P', slots: [slot('b')], level: 'god' })?.level).toBe(
      'intermediate',
    );
  });

  it('clamps a nonsense day count, and drops one that is not a number', () => {
    expect(
      parseLibraryWorkout('x', { name: 'P', slots: [slot('b')], daysPerWeek: 99 })?.daysPerWeek,
    ).toBe(7);
    expect(
      parseLibraryWorkout('x', { name: 'P', slots: [slot('b')], daysPerWeek: 'three' })
        ?.daysPerWeek,
    ).toBeNull();
  });
});

describe('asShared', () => {
  it('hands the share importer a payload with no custom exercises', () => {
    const shared = asShared(entry());
    expect(shared.customExercises).toEqual([]);
    expect(shared.revoked).toBe(false);
    expect(shared.toUid).toBeNull();
    expect(shared.body).toEqual(libraryBody(entry()));
  });
});

describe('filterLibrary', () => {
  const entries = [
    entry(),
    entry({ id: 'bw', name: 'Bodyweight', summary: 'No kit', tags: ['home'], level: 'beginner' }),
    entry({ id: 'legs', name: 'Leg day', summary: 'Squats', tags: ['gym'], level: 'advanced' }),
  ];

  it('returns everything, name-sorted, with no filter', () => {
    expect(
      filterLibrary(entries, { query: '', tag: null, level: null }).map((one) => one.id),
    ).toEqual(['bw', 'legs', 'ppl-push']);
  });

  it('matches a name on a word prefix', () => {
    expect(
      filterLibrary(entries, { query: 'bod', tag: null, level: null }).map((one) => one.id),
    ).toEqual(['bw']);
  });

  it('matches the summary and the tags too', () => {
    expect(
      filterLibrary(entries, { query: 'squats', tag: null, level: null }).map((one) => one.id),
    ).toEqual(['legs']);
    expect(
      filterLibrary(entries, { query: 'push pull', tag: null, level: null }).map((one) => one.id),
    ).toEqual(['ppl-push']);
  });

  it('narrows by tag and by level', () => {
    expect(filterLibrary(entries, { query: '', tag: 'gym', level: null })).toHaveLength(2);
    expect(filterLibrary(entries, { query: '', tag: null, level: 'beginner' })).toHaveLength(1);
    expect(filterLibrary(entries, { query: '', tag: 'gym', level: 'beginner' })).toHaveLength(0);
  });
});

describe('libraryTags', () => {
  it('lists the most common tag first', () => {
    const entries = [entry({ tags: ['gym'] }), entry({ id: 'b', tags: ['gym', 'home'] })];
    expect(libraryTags(entries)).toEqual(['gym', 'home']);
  });
});

describe('describeSize', () => {
  it('counts the exercises and the sets', () => {
    expect(describeSize(entry())).toBe('2 exercises · 7 sets');
  });
});
