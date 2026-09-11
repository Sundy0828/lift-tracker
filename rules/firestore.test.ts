import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

/**
 * `firestore.rules` as code, not configuration (Appendix A).
 *
 * These run against the Firestore emulator rather than the app, so they test
 * what the server actually enforces — not what the client remembers to ask
 * for. That distinction is the point: every check here is the last line of
 * defence for data the UI has no say over, and a signed-in stranger can talk
 * to Firestore directly.
 *
 * Needs the emulator: `npm run emulators`, then `npm run test:rules`. Kept out
 * of `npm test` on purpose, so the unit suite stays runnable with nothing
 * installed but node.
 */

const PROJECT_ID = 'demo-lift-tracker';

let env: RulesTestEnvironment;

const ALICE = 'alice';
const BOB = 'bob';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

afterEach(async () => {
  await env.clearFirestore();
});

/** A share document as the app writes it. */
function shareDoc(ownerUid: string, revoked = false): Record<string, unknown> {
  return {
    ownerUid,
    sourceWorkoutId: 'w1',
    versionNumber: 1,
    name: 'PUSH',
    slots: [],
    groupRest: {},
    customExercises: [],
    revoked,
  };
}

/** Seeds a document with the rules switched off, for read-side cases. */
async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe('users/{uid}', () => {
  it('lets the owner read and write their own tree', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(db, `users/${ALICE}/workouts/w1`), { name: 'PUSH' }));
    await assertSucceeds(getDoc(doc(db, `users/${ALICE}/workouts/w1`)));
    await assertSucceeds(
      setDoc(doc(db, `users/${ALICE}/sessions/s1`), { status: 'active', entries: [] }),
    );
  });

  it('refuses another account, for every operation', async () => {
    await seed(`users/${ALICE}/workouts/w1`, { name: 'PUSH' });
    const bob = env.authenticatedContext(BOB).firestore();

    // The Done-when for this phase: nobody can touch another user's data.
    await assertFails(getDoc(doc(bob, `users/${ALICE}/workouts/w1`)));
    await assertFails(setDoc(doc(bob, `users/${ALICE}/workouts/w1`), { name: 'HACKED' }));
    await assertFails(updateDoc(doc(bob, `users/${ALICE}/workouts/w1`), { name: 'HACKED' }));
    await assertFails(deleteDoc(doc(bob, `users/${ALICE}/workouts/w1`)));
    await assertFails(getDocs(collection(bob, `users/${ALICE}/workouts`)));
  });

  it('refuses a signed-out client entirely', async () => {
    await seed(`users/${ALICE}/workouts/w1`, { name: 'PUSH' });
    const anon = env.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(anon, `users/${ALICE}/workouts/w1`)));
    await assertFails(setDoc(doc(anon, `users/${ALICE}/workouts/w1`), { name: 'HACKED' }));
  });

  it('reaches every nested collection, not just the top level', async () => {
    await seed(`users/${ALICE}/workouts/w1/versions/1`, { versionNumber: 1 });
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(bob, `users/${ALICE}/workouts/w1/versions/1`)));
    await assertFails(setDoc(doc(bob, `users/${ALICE}/exerciseStats/bench`), { bestE1rm: 999 }));
  });
});

describe('sharedWorkouts — reading', () => {
  it('is public to fetch by id: a share link works with no account', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'sharedWorkouts/s1')));
  });

  it('refuses a revoked share to everyone but its owner', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE, true));

    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sharedWorkouts/s1')));
    await assertFails(getDoc(doc(env.authenticatedContext(BOB).firestore(), 'sharedWorkouts/s1')));
    // The owner still sees it, or they could not tell what they had turned off.
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext(ALICE).firestore(), 'sharedWorkouts/s1')),
    );
  });

  it('treats a share with no revoked flag as unreadable', async () => {
    // Fails closed: a document written by hand must not be public by omission.
    await seed('sharedWorkouts/s1', { ownerUid: ALICE, name: 'PUSH' });
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sharedWorkouts/s1')));
  });

  it('is not a directory: the collection cannot be listed by a stranger', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    const bob = env.authenticatedContext(BOB).firestore();

    await assertFails(getDocs(collection(bob, 'sharedWorkouts')));
    await assertFails(
      getDocs(collection(env.unauthenticatedContext().firestore(), 'sharedWorkouts')),
    );
    // Nor by narrowing to somebody else's shares.
    await assertFails(
      getDocs(query(collection(bob, 'sharedWorkouts'), where('ownerUid', '==', ALICE))),
    );
  });

  it('lets an owner list their own shares, revoked ones included', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    await seed('sharedWorkouts/s2', shareDoc(ALICE, true));
    const alice = env.authenticatedContext(ALICE).firestore();

    await assertSucceeds(
      getDocs(query(collection(alice, 'sharedWorkouts'), where('ownerUid', '==', ALICE))),
    );
  });
});

describe('sharedWorkouts — writing', () => {
  it('lets a signed-in account create a share it owns', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, 'sharedWorkouts/s1'), shareDoc(ALICE)));
  });

  it('refuses a share created under somebody else uid', async () => {
    // The impersonation attack: every other check here keys on ownerUid.
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bob, 'sharedWorkouts/s1'), shareDoc(ALICE)));
  });

  it('refuses an anonymous create', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, 'sharedWorkouts/s1'), shareDoc(ALICE)));
  });

  it('refuses a share that is born revoked, or with no flag at all', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, 'sharedWorkouts/s1'), shareDoc(ALICE, true)));
    await assertFails(setDoc(doc(alice, 'sharedWorkouts/s2'), { ownerUid: ALICE, name: 'PUSH' }));
  });

  it('lets the owner revoke, and nobody else', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));

    await assertFails(
      updateDoc(doc(env.authenticatedContext(BOB).firestore(), 'sharedWorkouts/s1'), {
        revoked: true,
      }),
    );
    await assertFails(
      updateDoc(doc(env.unauthenticatedContext().firestore(), 'sharedWorkouts/s1'), {
        revoked: true,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(env.authenticatedContext(ALICE).firestore(), 'sharedWorkouts/s1'), {
        revoked: true,
      }),
    );
  });

  it('refuses to let ownership move, in either direction', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));

    // The owner cannot hand it over...
    await assertFails(
      updateDoc(doc(env.authenticatedContext(ALICE).firestore(), 'sharedWorkouts/s1'), {
        ownerUid: BOB,
      }),
    );
    // ...and nobody can take it.
    await assertFails(
      updateDoc(doc(env.authenticatedContext(BOB).firestore(), 'sharedWorkouts/s1'), {
        ownerUid: BOB,
      }),
    );
  });

  it('refuses a stranger overwriting the payload of a live share', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bob, 'sharedWorkouts/s1'), shareDoc(BOB)));
    await assertFails(updateDoc(doc(bob, 'sharedWorkouts/s1'), { name: 'HACKED' }));
  });

  it('freezes a live share: the owner may flip revoked and nothing else', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    const alice = env.authenticatedContext(ALICE).firestore();

    // The body a recipient already holds cannot move under them.
    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { name: 'PULL' }));
    await assertFails(
      updateDoc(doc(alice, 'sharedWorkouts/s1'), { slots: [{ slotId: 'x', exerciseId: 'y' }] }),
    );
    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { versionNumber: 2 }));
    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { sourceWorkoutId: 'w2' }));
    // Nor by adding a field that was never created.
    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { note: 'hi' }));
    // Nor by a whole-document rewrite, which is the same write by another name.
    await assertFails(
      setDoc(doc(alice, 'sharedWorkouts/s1'), { ...shareDoc(ALICE), name: 'PULL' }),
    );
  });

  it('refuses a body change smuggled in alongside a revoke', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    const alice = env.authenticatedContext(ALICE).firestore();

    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { revoked: true, name: 'PULL' }));
    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { revoked: true, ownerUid: BOB }));
  });

  it('accepts the merging revoke write the app makes, both ways', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    const alice = env.authenticatedContext(ALICE).firestore();

    await assertSucceeds(
      setDoc(doc(alice, 'sharedWorkouts/s1'), { revoked: true }, { merge: true }),
    );
    await assertSucceeds(
      setDoc(doc(alice, 'sharedWorkouts/s1'), { revoked: false }, { merge: true }),
    );
  });

  it('refuses a revoked flag that is not a boolean', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { revoked: 'yes' }));
  });

  it('lets only the owner delete', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE));
    await assertFails(
      deleteDoc(doc(env.authenticatedContext(BOB).firestore(), 'sharedWorkouts/s1')),
    );
    await assertSucceeds(
      deleteDoc(doc(env.authenticatedContext(ALICE).firestore(), 'sharedWorkouts/s1')),
    );
  });
});

describe('everything else', () => {
  it('is closed, so a new collection is denied until it is thought about', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, 'somethingNew/x'), { a: 1 }));
    await assertFails(getDoc(doc(alice, 'somethingNew/x')));
  });
});
