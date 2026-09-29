import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatSyncAge,
  releaseSync,
  reportSync,
  resetSyncForTests,
  subscribeSync,
  syncSnapshot,
} from './sync';

const clear = { pending: false, fromCache: false };
const pending = { pending: true, fromCache: false };
const cached = { pending: false, fromCache: true };

afterEach(() => {
  resetSyncForTests();
  vi.useRealTimers();
});

describe('syncSnapshot', () => {
  it('is idle before any listener reports', () => {
    expect(syncSnapshot()).toMatchObject({ idle: true, pending: false, offline: false });
  });

  it('is pending while any one listener has an unacked write', () => {
    reportSync('a', clear);
    reportSync('b', pending);
    expect(syncSnapshot().pending).toBe(true);

    reportSync('b', clear);
    expect(syncSnapshot().pending).toBe(false);
  });

  it('is offline only when every listener is answering from cache', () => {
    reportSync('a', cached);
    expect(syncSnapshot().offline).toBe(true);

    // One listener reaching the server means the app is not offline.
    reportSync('b', clear);
    expect(syncSnapshot().offline).toBe(false);
  });

  it('does not read an empty tally as offline', () => {
    // `every` over nothing is true, which would claim offline at first paint.
    expect(syncSnapshot().offline).toBe(false);
    expect(syncSnapshot().idle).toBe(true);
  });
});

describe('syncedAt', () => {
  it('stamps only the fall from pending to clear', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));

    // Never pending, so nothing has synced yet — a clear listener is not a sync.
    reportSync('a', clear);
    expect(syncSnapshot().syncedAt).toBeNull();

    reportSync('a', pending);
    expect(syncSnapshot().syncedAt).toBeNull();

    reportSync('a', clear);
    const first = syncSnapshot().syncedAt;
    expect(first).toBe(Date.parse('2026-01-01T10:00:00Z'));

    // Staying clear is not an event: the stamp must not creep forward.
    vi.setSystemTime(new Date('2026-01-01T10:05:00Z'));
    reportSync('b', clear);
    expect(syncSnapshot().syncedAt).toBe(first);
  });
});

describe('releaseSync', () => {
  it('drops a gone listener so its reading cannot linger', () => {
    reportSync('a', pending);
    expect(syncSnapshot().pending).toBe(true);

    releaseSync('a');
    expect(syncSnapshot()).toMatchObject({ pending: false, idle: true });
  });

  it('leaves the other listeners alone', () => {
    reportSync('a', pending);
    reportSync('b', clear);
    releaseSync('b');
    expect(syncSnapshot().pending).toBe(true);
    expect(syncSnapshot().idle).toBe(false);
  });
});

describe('subscribeSync', () => {
  it('notifies on a change and not on a repeat of the same reading', () => {
    const notify = vi.fn();
    const stop = subscribeSync(notify);

    reportSync('a', pending);
    expect(notify).toHaveBeenCalledTimes(1);

    // Same metadata again: a snapshot fired, but nothing anyone can see moved.
    reportSync('a', pending);
    expect(notify).toHaveBeenCalledTimes(1);

    reportSync('a', clear);
    expect(notify).toHaveBeenCalledTimes(2);

    stop();
    reportSync('a', pending);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('keeps a stable snapshot identity so useSyncExternalStore does not loop', () => {
    reportSync('a', pending);
    const first = syncSnapshot();
    reportSync('a', pending);
    expect(syncSnapshot()).toBe(first);
  });
});

describe('formatSyncAge', () => {
  const at = Date.parse('2026-01-01T12:00:00Z');
  const age = (seconds: number): string => formatSyncAge(at, at + seconds * 1000);

  it('stays coarse rather than inviting anyone to watch it', () => {
    expect(age(0)).toBe('just now');
    expect(age(9)).toBe('just now');
    expect(age(10)).toBe('less than a minute ago');
    expect(age(59)).toBe('less than a minute ago');
  });

  it('counts minutes, hours, and days, singular where it should be', () => {
    expect(age(60)).toBe('1 minute ago');
    expect(age(120)).toBe('2 minutes ago');
    expect(age(3600)).toBe('1 hour ago');
    expect(age(3600 * 5)).toBe('5 hours ago');
    expect(age(86_400)).toBe('1 day ago');
    expect(age(86_400 * 3)).toBe('3 days ago');
  });

  it('does not report a negative age from a clock that stepped backwards', () => {
    expect(formatSyncAge(at, at - 60_000)).toBe('just now');
  });
});
