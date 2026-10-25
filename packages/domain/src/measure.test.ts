import { describe, expect, it } from 'vitest';
import { sessionsToCsv } from './export';
import { recordMilestones, volumeLoadKg } from './history';
import type { ExercisePerformance } from './history';
import { formatSeconds, formatTarget, parseSeconds, toMetres } from './measure';
import { buildStatsUpdate } from './overlay';
import type { LoggedSet, SessionEntry } from './sessions';
import {
  addAdHocEntry,
  assessSet,
  emptySet,
  entryMeasure,
  isFullyEntered,
  isPerformed,
  newSession,
  parseLoggedSet,
  parseSessionEntry,
  setEntryMeasure,
  workedSets,
} from './sessions';
import { adjustedE1rm, compareSets, describeComparison, describeE1rm, formatSet } from './strength';
import { diffPrescriptions } from './workoutDiff';
import type { Prescription } from './workouts';
import {
  DEFAULT_PRESCRIPTION,
  estimateSetSeconds,
  formatPrescription,
  normalizePrescription,
  parsePrescription,
  withMeasure,
} from './workouts';

function set(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return { ...emptySet(0), completedAt: '2026-10-08T10:00:00.000Z', ...overrides };
}

function firstEntry(entries: readonly SessionEntry[]): SessionEntry {
  const [first] = entries;
  if (first === undefined) throw new Error('no entry');
  return first;
}

const timed: Prescription = withMeasure(DEFAULT_PRESCRIPTION, 'time');
const carried: Prescription = withMeasure(DEFAULT_PRESCRIPTION, 'distance', 'm');

describe('time', () => {
  it('reads and writes the way a stopwatch shows it', () => {
    expect(formatSeconds(45)).toBe('45s');
    expect(formatSeconds(90)).toBe('1:30');
    expect(formatSeconds(3725)).toBe('1:02:05');
    expect(parseSeconds('90')).toBe(90);
    expect(parseSeconds('1:30')).toBe(90);
    expect(parseSeconds('1:02:05')).toBe(3725);
    expect(parseSeconds('-5')).toBeNull();
    expect(parseSeconds('1:x')).toBeNull();
  });

  it('prints targets in their own unit', () => {
    expect(formatTarget({ min: 30, max: 60 }, 'time', 'm')).toBe('30s-1:00');
    expect(formatTarget({ min: 20, max: 40 }, 'distance', 'm')).toBe('20-40 m');
    expect(formatTarget({ min: 8, max: 12 }, 'reps', 'm')).toBe('8-12');
    expect(formatPrescription(timed)).toBe('3 x 30s-1:00 @ 1-2 RIR');
  });
});

describe('a prescription measure', () => {
  it('leaves a reps prescription exactly as it was', () => {
    expect(normalizePrescription(DEFAULT_PRESCRIPTION)).toEqual(DEFAULT_PRESCRIPTION);
    expect('measure' in normalizePrescription(DEFAULT_PRESCRIPTION)).toBe(false);
  });

  it('resets the target when the measure changes, and survives a round trip', () => {
    expect(timed.repRange).toEqual({ min: 30, max: 60 });
    expect(parsePrescription(JSON.parse(JSON.stringify(carried)))).toEqual(carried);
    expect(withMeasure(carried, 'reps')).toEqual({ ...DEFAULT_PRESCRIPTION });
  });

  it('estimates a timed set by its time, not by reps', () => {
    expect(estimateSetSeconds(timed)).toBe(12 + 45);
  });

  it('names a switch of measure as a target change', () => {
    const [change] = diffPrescriptions(DEFAULT_PRESCRIPTION, timed);
    expect(change).toEqual({ field: 'target', before: '8-12', after: '30s-1:00' });
  });
});

describe('timed and distance sets', () => {
  it('count as performed and worked without reps or a load', () => {
    const hold = set({ seconds: 45 });
    expect(isPerformed(hold)).toBe(true);
    expect(workedSets([hold])).toHaveLength(1);
    expect(adjustedE1rm(hold)).toBeNull();
  });

  it('are judged against the target in their own unit', () => {
    expect(assessSet(set({ seconds: 20 }), timed)).toBe('under');
    expect(assessSet(set({ seconds: 45 }), timed)).toBe('on-target');
    expect(assessSet(set({ seconds: 75 }), timed)).toBe('over');
    // 30 yd is 27.4 m: inside 20-40 m.
    expect(assessSet(set({ distance: { value: 30, unit: 'yd' } }), carried)).toBe('on-target');
    // A load with no time is half-entered; nothing at all is untouched.
    expect(assessSet(set({ weight: { value: 20, unit: 'kg' } }), timed)).toBe('incomplete');
    expect(assessSet(set(), timed)).toBe('unassessed');
  });

  it('are fully entered by their amount and effort', () => {
    expect(isFullyEntered(set({ seconds: 45 }), timed)).toBe(false);
    expect(isFullyEntered(set({ seconds: 45, rir: 1 }), timed)).toBe(true);
  });

  it('compare on time or distance, with the load breaking a tie', () => {
    expect(compareSets(set({ seconds: 50 }), set({ seconds: 45 }))?.direction).toBe('up');
    expect(compareSets(set({ seconds: 40 }), set({ seconds: 45 }))?.direction).toBe('down');
    const heavier = compareSets(
      set({ seconds: 45, weight: { value: 25, unit: 'lb' } }),
      set({ seconds: 45, weight: { value: 10, unit: 'lb' } }),
    );
    expect(heavier?.direction).toBe('up');
    expect(describeComparison(set({ seconds: 50 }), set({ seconds: 45 }), 'lb')?.label).toBe('+5s');
  });

  it('print as a time or a distance', () => {
    expect(formatSet(set({ seconds: 45 }), 'lb')).toBe('45s');
    expect(
      formatSet(
        set({ distance: { value: 40, unit: 'm' }, weight: { value: 50, unit: 'lb' } }),
        'lb',
      ),
    ).toBe('50 lb × 40 m');
    expect(toMetres({ value: 1, unit: 'mi' })).toBeCloseTo(1609.344);
  });

  it('read back from a stored document', () => {
    const parsed = parseLoggedSet({ seconds: 45, distance: { value: 2, unit: 'km' } }, 0);
    expect(parsed.seconds).toBe(45);
    expect(parsed.distance).toEqual({ value: 2, unit: 'km' });
  });
});

describe('an ad-hoc row', () => {
  it('takes its own measure, and only an ad-hoc row can', () => {
    const entries = addAdHocEntry([], { exerciseId: 'plank', exerciseName: 'Plank' });
    const key = 'adhoc:plank#0';
    const switched = setEntryMeasure(entries, key, 'time');
    expect(switched[0] === undefined ? null : entryMeasure(switched[0])).toBe('time');
    const back = parseSessionEntry(JSON.parse(JSON.stringify(switched[0])));
    expect(back === null ? null : entryMeasure(back)).toBe('time');

    const prescribed: SessionEntry = { ...firstEntry(switched), prescription: timed };
    expect(setEntryMeasure([prescribed], key, 'reps')[0]).toBe(prescribed);
  });
});

describe('assisted and bodyweight sets', () => {
  const load = (value: number) => ({ value, unit: 'kg' as const });

  it('score more as the assistance comes off, and more again without it', () => {
    const heavyHelp = adjustedE1rm(set({ weight: load(-30), reps: 8 })) ?? NaN;
    const lightHelp = adjustedE1rm(set({ weight: load(-10), reps: 8 })) ?? NaN;
    const none = adjustedE1rm(set({ weight: load(0), reps: 8 })) ?? NaN;
    expect(heavyHelp).toBeLessThan(lightHelp);
    expect(lightHelp).toBeLessThan(none);
    // And more reps at the same help is progress too.
    expect(adjustedE1rm(set({ weight: load(-10), reps: 10 }))).toBeGreaterThan(lightHelp);
  });

  it('leaves a barbell set scored exactly as before', () => {
    expect(adjustedE1rm(set({ weight: load(100), reps: 5 }))).toBeCloseTo(100 * (1 + 5 / 30));
  });

  it('are explained as assistance, not as a weight lifted', () => {
    expect(describeE1rm(set({ weight: load(-40), reps: 5 }), 'kg')).toContain('of assistance');
    expect(formatSet(set({ weight: load(-20), reps: 8 }), 'kg')).toBe('-20 kg × 8');
  });

  it('make a record of the first set, even below zero, and of each improvement', () => {
    const session = newSession({
      sessionId: 's1',
      workoutId: null,
      workoutVersion: null,
      workoutName: 'Ad-hoc',
      body: null,
    });
    const entry: SessionEntry = {
      ...firstEntry(addAdHocEntry([], { exerciseId: 'dip', exerciseName: 'Dips' })),
      sets: [set({ weight: load(-40), reps: 5 })],
    };
    const first = buildStatsUpdate({ ...session, entries: [entry] }, () => null);
    expect(first.prs).toHaveLength(1);
    expect(first.prs[0]?.isFirst).toBe(true);

    const stats = first.exerciseStats.get('dip') ?? null;
    const better = buildStatsUpdate(
      {
        ...session,
        id: 's2',
        entries: [{ ...entry, sets: [set({ weight: load(-30), reps: 5 })] }],
      },
      () => stats,
    );
    expect(better.prs[0]?.isFirst).toBe(false);
  });

  it('start the record history at the first set, below zero or not', () => {
    const performance = (e1rmKg: number): ExercisePerformance => ({
      sessionId: String(e1rmKg),
      performedOn: '2026-10-08',
      workoutId: null,
      workoutName: '',
      workoutVersion: null,
      sets: [],
      best: set(),
      e1rmKg,
    });
    const milestones = recordMilestones([performance(-20), performance(-10)]);
    expect(milestones).toHaveLength(2);
    expect(milestones[1]?.isFirst).toBe(true);
  });

  it('add no tonnage, and export as a plain negative number', () => {
    expect(volumeLoadKg([set({ weight: load(-20), reps: 8 })])).toBe(0);
    const session = {
      ...newSession({
        sessionId: 's',
        workoutId: null,
        workoutVersion: null,
        workoutName: 'Ad-hoc',
        body: null,
      }),
      entries: addAdHocEntry([], { exerciseId: 'dip', exerciseName: 'Dips' }).map((entry) => ({
        ...entry,
        sets: [set({ weight: load(-20), reps: 8 })],
      })),
    };
    const csv = sessionsToCsv([session], 'kg');
    expect(csv).toContain(',-20,kg,8,');
    expect(csv).not.toContain("'-20");
  });
});
