/**
 * Ids for the user's own documents: sessions, workouts, custom exercises.
 *
 * Minted client-side so a write needs no round trip and works offline. These
 * only have to be unique within one account, never secret: every one of them
 * lives under `users/{uid}`, where the rules already keep everyone else out.
 *
 * React Native's engine (Hermes) has no `crypto` global, so off the web this
 * falls back to a version-4 uuid from `Math.random`. That is plenty for
 * uniqueness. It is **not** fit for an id that grants access, which is why
 * share ids do not use this (see `mutations/sharing`).
 */
export function newRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return mathRandomUuid();
}

/** A version-4 uuid, in the same shape `crypto.randomUUID` returns. */
export function mathRandomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (char) => {
    const nibble = Math.floor(Math.random() * 16);
    // The variant digit is 8, 9, a or b.
    return (char === 'x' ? nibble : (nibble & 0x3) | 0x8).toString(16);
  });
}
