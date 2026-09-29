import { describe, expect, it } from 'vitest';
import { exportFilename, sessionsToCsv, sessionsToJson } from './export';
import type { LoggedSet, Session, SessionEntry } from './sessions';
import { emptySet } from './sessions';
import type { Unit } from './types';
import { DEFAULT_PRESCRIPTION } from './workouts';

function set(
  setIndex: number,
  weight: number | null,
  reps: number | null,
  overrides: Partial<LoggedSet> & { unit?: Unit } = {},
): LoggedSet {
  const { unit = 'lb', ...rest } = overrides;
  return {
    ...emptySet(setIndex),
    weight: weight === null ? null : { value: weight, unit },
    reps,
    completedAt: '2026-08-26T18:10:00.000Z',
    ...rest,
  };
}

function entry(exerciseId: string, sets: LoggedSet[], overrides: Partial<SessionEntry> = {}) {
  return {
    slotId: `slot-${exerciseId}`,
    kind: 'exercise',
    exerciseId,
    exerciseName: exerciseId,
    occurrenceIndex: 0,
    prescription: { ...DEFAULT_PRESCRIPTION, sets: sets.length },
    sets,
    supersetGroup: null,
    notes: '',
    ...overrides,
  } satisfies SessionEntry;
}

function session(entries: SessionEntry[], overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    workoutId: 'push',
    workoutVersion: 2,
    workoutName: 'PUSH',
    status: 'completed',
    performedOn: '2026-08-26',
    startedAt: '2026-08-26T18:00:00.000Z',
    completedAt: '2026-08-26T19:00:00.000Z',
    entries,
    groupRest: {},
    bodyweight: null,
    notes: '',
    ...overrides,
  };
}

function rows(csv: string): string[] {
  return csv.trimEnd().split('\n');
}

describe('sessionsToCsv', () => {
  it('writes a header and one row per set', () => {
    const csv = sessionsToCsv([session([entry('bench', [set(0, 185, 8), set(1, 185, 7)])])], 'lb');
    const lines = rows(csv);

    expect(lines[0]).toContain('performed_on');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('2026-08-26');
    expect(lines[1]).toContain('185');
  });

  it('converts the load to the display unit but keeps the logged one', () => {
    const csv = sessionsToCsv([session([entry('bench', [set(0, 100, 5, { unit: 'kg' })])])], 'lb');
    const [, row = ''] = rows(csv);

    // 100 kg is 220.46 lb.
    expect(row).toContain('220.46');
    expect(row).toContain('kg');
  });

  it('keeps a rest row out of the file, since it has no sets', () => {
    const rest = entry('__rest__', [], { kind: 'rest' });
    expect(rows(sessionsToCsv([session([rest])], 'lb'))).toHaveLength(1);
  });

  it('quotes a field holding a comma or a quote', () => {
    const csv = sessionsToCsv(
      [session([entry('bench', [set(0, 185, 8)])], { workoutName: 'PUSH, "heavy"' })],
      'lb',
    );
    expect(csv).toContain('"PUSH, ""heavy"""');
  });

  it('defuses a name a spreadsheet would run as a formula', () => {
    const csv = sessionsToCsv(
      [session([entry('bench', [set(0, 185, 8)])], { workoutName: '=cmd|calc' })],
      'lb',
    );
    expect(csv).toContain("'=cmd|calc");
  });

  it('marks a warmup and a skipped set rather than dropping them', () => {
    const csv = sessionsToCsv(
      [
        session([
          entry('bench', [
            set(0, 95, 10, { isWarmup: true }),
            set(1, 185, null, { skipped: true }),
          ]),
        ]),
      ],
      'lb',
    );
    const lines = rows(csv);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('yes');
  });

  it('leaves a missing number empty rather than writing a zero', () => {
    const csv = sessionsToCsv([session([entry('pullup', [set(0, null, 8)])])], 'lb');
    // Empty weight and unit columns, straight after the skipped column.
    expect(rows(csv)[1]).toContain('no,no,,,8');
  });

  it('ends with a newline, so appending to it does not lose the last row', () => {
    expect(sessionsToCsv([session([entry('bench', [set(0, 185, 8)])])], 'lb')).toMatch(/\n$/u);
  });
});

describe('sessionsToJson', () => {
  it('wraps the sessions with enough to read them back', () => {
    const json = sessionsToJson(
      [session([entry('bench', [set(0, 185, 8)])])],
      '2026-09-16T00:00:00.000Z',
    );
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed['formatVersion']).toBe(1);
    expect(parsed['sessionCount']).toBe(1);
    expect(parsed['exportedAt']).toBe('2026-09-16T00:00:00.000Z');
  });

  it('keeps each weight in the unit it was entered in', () => {
    const json = sessionsToJson([session([entry('bench', [set(0, 100, 5, { unit: 'kg' })])])]);
    expect(json).toContain('"unit": "kg"');
    expect(json).toContain('"value": 100');
  });
});

describe('exportFilename', () => {
  it('dates the file, because exports accumulate', () => {
    expect(exportFilename('csv', '2026-09-16')).toBe('lift-tracker-2026-09-16.csv');
    expect(exportFilename('json', '2026-09-16')).toBe('lift-tracker-2026-09-16.json');
  });
});
