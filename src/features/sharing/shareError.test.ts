import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { describeShareError } from './shareError';

const FALLBACK = 'Could not create the link';

describe('describeShareError', () => {
  it('names stale rules as the cause of a refusal', () => {
    // The code is bare, not "firestore/permission-denied". A prefixed check
    // never matches, which is how this failure stayed invisible.
    const message = describeShareError(
      new FirebaseError('permission-denied', 'Missing or insufficient permissions.'),
      FALLBACK,
    );
    expect(message).toContain('firebase deploy --only firestore:rules');
  });

  it('tells an offline user to retry rather than blaming the share', () => {
    const message = describeShareError(new FirebaseError('unavailable', 'offline'), FALLBACK);
    expect(message).toContain('back online');
  });

  it('keeps the code on a failure it has no specific advice for', () => {
    const message = describeShareError(new FirebaseError('internal', 'boom'), FALLBACK);
    expect(message).toBe(`${FALLBACK} (internal)`);
  });

  it('falls back for anything that is not a Firebase error', () => {
    expect(describeShareError(new Error('boom'), FALLBACK)).toBe(FALLBACK);
    expect(describeShareError(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
