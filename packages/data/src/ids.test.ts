import { afterEach, describe, expect, it, vi } from 'vitest';
import { mathRandomUuid, newRecordId } from './ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newRecordId', () => {
  it('uses crypto where the platform has it', () => {
    expect(newRecordId()).toMatch(UUID_V4);
  });

  /** React Native's Hermes engine: starting a workout threw here. */
  it('still mints an id where there is no crypto global', () => {
    vi.stubGlobal('crypto', undefined);
    expect(newRecordId()).toMatch(UUID_V4);
  });
});

describe('mathRandomUuid', () => {
  it('has the version-4 shape, variant included', () => {
    for (let index = 0; index < 200; index += 1) expect(mathRandomUuid()).toMatch(UUID_V4);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => mathRandomUuid()));
    expect(ids.size).toBe(1000);
  });
});
