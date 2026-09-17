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
function shareDoc(
  ownerUid: string,
  revoked = false,
  toUid: string | null = null,
): Record<string, unknown> {
  return {
    ownerUid,
    toUid,
    sourceWorkoutId: 'w1',
    versionNumber: 1,
    name: 'PUSH',
    slots: [],
    groupRest: {},
    customExercises: [],
    revoked,
  };
}

/** A friend-code row as the app writes it. */
function codeDoc(uid: string, displayName = 'Alice'): Record<string, unknown> {
  return { uid, displayName };
}

/** The pair's one document id: the two uids sorted and joined. */
function pairId(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('_');
}

/** A friend request as the app writes it. */
function edgeDoc(
  fromUid: string,
  toUid: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    uids: [fromUid, toUid].sort((left, right) => left.localeCompare(right)),
    fromUid,
    toUid,
    fromName: 'Alice',
    toName: '',
    status: 'pending',
    respondedAt: null,
    ...over,
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

describe('sharedWorkouts — addressed to a friend', () => {
  it('lets the recipient list what was sent to them', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE, false, BOB));
    const bob = env.authenticatedContext(BOB).firestore();

    await assertSucceeds(
      getDocs(query(collection(bob, 'sharedWorkouts'), where('toUid', '==', BOB))),
    );
  });

  it('does not let a third party list somebody else inbox', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE, false, BOB));
    const carol = env.authenticatedContext('carol').firestore();

    await assertFails(
      getDocs(query(collection(carol, 'sharedWorkouts'), where('toUid', '==', BOB))),
    );
  });

  it('still refuses an unconstrained listing', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE, false, BOB));
    await assertFails(
      getDocs(collection(env.authenticatedContext(BOB).firestore(), 'sharedWorkouts')),
    );
  });

  it('lets an owner list shares written before recipients existed', async () => {
    // No `toUid` field at all, the way an older client wrote it.
    await seed('sharedWorkouts/s1', {
      ownerUid: ALICE,
      sourceWorkoutId: 'w1',
      versionNumber: 1,
      name: 'PUSH',
      slots: [],
      groupRest: {},
      customExercises: [],
      revoked: false,
    });
    const alice = env.authenticatedContext(ALICE).firestore();

    await assertSucceeds(
      getDocs(query(collection(alice, 'sharedWorkouts'), where('ownerUid', '==', ALICE))),
    );
  });

  it('accepts a create that names a recipient, and one that names nobody', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, 'sharedWorkouts/s1'), shareDoc(ALICE, false, BOB)));
    await assertSucceeds(setDoc(doc(alice, 'sharedWorkouts/s2'), shareDoc(ALICE)));
  });

  it('refuses a recipient that is not a uid', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, 'sharedWorkouts/s1'), { ...shareDoc(ALICE), toUid: 42 }));
  });

  it('freezes the recipient, so a share cannot be redirected', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE, false, BOB));
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(updateDoc(doc(alice, 'sharedWorkouts/s1'), { toUid: 'carol' }));
  });

  it('gives a recipient no write of any kind', async () => {
    await seed('sharedWorkouts/s1', shareDoc(ALICE, false, BOB));
    const bob = env.authenticatedContext(BOB).firestore();

    await assertFails(updateDoc(doc(bob, 'sharedWorkouts/s1'), { revoked: true }));
    await assertFails(deleteDoc(doc(bob, 'sharedWorkouts/s1')));
  });
});

describe('friendCodes', () => {
  it('resolves one code at a time for any signed-in account', async () => {
    await seed('friendCodes/ABCDEFGH', codeDoc(ALICE));
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext(BOB).firestore(), 'friendCodes/ABCDEFGH')),
    );
  });

  it('is never a directory of accounts', async () => {
    await seed('friendCodes/ABCDEFGH', codeDoc(ALICE));

    await assertFails(
      getDocs(collection(env.authenticatedContext(BOB).firestore(), 'friendCodes')),
    );
    await assertFails(
      getDocs(
        query(
          collection(env.authenticatedContext(BOB).firestore(), 'friendCodes'),
          where('uid', '==', ALICE),
        ),
      ),
    );
  });

  it('refuses a signed-out lookup', async () => {
    await seed('friendCodes/ABCDEFGH', codeDoc(ALICE));
    await assertFails(
      getDoc(doc(env.unauthenticatedContext().firestore(), 'friendCodes/ABCDEFGH')),
    );
  });

  it('lets an account claim a free code for itself', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, 'friendCodes/ABCDEFGH'), codeDoc(ALICE)));
  });

  it('refuses a code claimed under somebody else uid', async () => {
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(setDoc(doc(bob, 'friendCodes/ABCDEFGH'), codeDoc(ALICE)));
  });

  it('refuses to hand a code that is already held to someone else', async () => {
    await seed('friendCodes/ABCDEFGH', codeDoc(ALICE));
    const bob = env.authenticatedContext(BOB).firestore();

    // A create on a document that exists is an update, and the uid cannot move.
    await assertFails(setDoc(doc(bob, 'friendCodes/ABCDEFGH'), codeDoc(BOB)));
    await assertFails(updateDoc(doc(bob, 'friendCodes/ABCDEFGH'), { uid: BOB }));
  });

  it('lets the holder rename, and nothing else', async () => {
    await seed('friendCodes/ABCDEFGH', codeDoc(ALICE));
    const alice = env.authenticatedContext(ALICE).firestore();

    await assertSucceeds(updateDoc(doc(alice, 'friendCodes/ABCDEFGH'), { displayName: 'Al' }));
    await assertFails(updateDoc(doc(alice, 'friendCodes/ABCDEFGH'), { uid: BOB }));
    await assertFails(updateDoc(doc(alice, 'friendCodes/ABCDEFGH'), { note: 'hi' }));
  });

  it('caps the name, so a public row cannot be flooded', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, 'friendCodes/ABCDEFGH'), codeDoc(ALICE, 'a'.repeat(41))));
  });

  it('lets only the holder withdraw it', async () => {
    await seed('friendCodes/ABCDEFGH', codeDoc(ALICE));

    await assertFails(
      deleteDoc(doc(env.authenticatedContext(BOB).firestore(), 'friendCodes/ABCDEFGH')),
    );
    await assertSucceeds(
      deleteDoc(doc(env.authenticatedContext(ALICE).firestore(), 'friendCodes/ABCDEFGH')),
    );
  });
});

describe('friendEdges', () => {
  const ID = pairId(ALICE, BOB);

  it('lets either side read the pair document, and nobody else', async () => {
    await seed(`friendEdges/${ID}`, edgeDoc(ALICE, BOB));

    await assertSucceeds(
      getDoc(doc(env.authenticatedContext(ALICE).firestore(), `friendEdges/${ID}`)),
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext(BOB).firestore(), `friendEdges/${ID}`)),
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext('carol').firestore(), `friendEdges/${ID}`)),
    );
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `friendEdges/${ID}`)));
  });

  it('lets you list your own connections, and refuses an unconstrained listing', async () => {
    await seed(`friendEdges/${ID}`, edgeDoc(ALICE, BOB));
    const alice = env.authenticatedContext(ALICE).firestore();

    await assertSucceeds(
      getDocs(query(collection(alice, 'friendEdges'), where('uids', 'array-contains', ALICE))),
    );
    await assertFails(getDocs(collection(alice, 'friendEdges')));
    // Nor somebody else's.
    await assertFails(
      getDocs(query(collection(alice, 'friendEdges'), where('uids', 'array-contains', 'carol'))),
    );
  });

  it('lets an account send a request from itself', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(setDoc(doc(alice, `friendEdges/${ID}`), edgeDoc(ALICE, BOB)));
  });

  it('refuses a request forged as coming from somebody else', async () => {
    // The impersonation attack: a request that appears in Bob's list from a
    // name he has never heard of.
    const carol = env.authenticatedContext('carol').firestore();
    await assertFails(setDoc(doc(carol, `friendEdges/${ID}`), edgeDoc(ALICE, BOB)));
  });

  it('refuses a request that names a pair it is not between', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    // Slipping a third uid into `uids` would make the document readable by an
    // account the connection has nothing to do with.
    await assertFails(
      setDoc(doc(alice, `friendEdges/${ID}`), {
        ...edgeDoc(ALICE, BOB),
        uids: [ALICE, BOB, 'carol'],
      }),
    );
    await assertFails(
      setDoc(doc(alice, `friendEdges/${ID}`), { ...edgeDoc(ALICE, BOB), uids: [ALICE, 'carol'] }),
    );
  });

  it('refuses a request that is born accepted, or addressed to yourself', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(alice, `friendEdges/${ID}`), edgeDoc(ALICE, BOB, { status: 'accepted' })),
    );
    await assertFails(
      setDoc(doc(alice, `friendEdges/${pairId(ALICE, ALICE)}`), edgeDoc(ALICE, ALICE)),
    );
  });

  it('caps the sender name, so a public row cannot be flooded', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(
      setDoc(doc(alice, `friendEdges/${ID}`), edgeDoc(ALICE, BOB, { fromName: 'a'.repeat(41) })),
    );
  });

  it('lets only the account that was asked accept', async () => {
    await seed(`friendEdges/${ID}`, edgeDoc(ALICE, BOB));

    // The sender cannot accept their own request.
    await assertFails(
      updateDoc(doc(env.authenticatedContext(ALICE).firestore(), `friendEdges/${ID}`), {
        status: 'accepted',
        toName: 'Bob',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(env.authenticatedContext(BOB).firestore(), `friendEdges/${ID}`), {
        status: 'accepted',
        toName: 'Bob',
      }),
    );
  });

  it('freezes the pair and the direction when accepting', async () => {
    await seed(`friendEdges/${ID}`, edgeDoc(ALICE, BOB));
    const bob = env.authenticatedContext(BOB).firestore();

    await assertFails(updateDoc(doc(bob, `friendEdges/${ID}`), { fromUid: BOB }));
    await assertFails(updateDoc(doc(bob, `friendEdges/${ID}`), { toUid: 'carol' }));
    await assertFails(updateDoc(doc(bob, `friendEdges/${ID}`), { uids: [BOB, 'carol'] }));
    await assertFails(updateDoc(doc(bob, `friendEdges/${ID}`), { fromName: 'Not Alice' }));
    // Nor smuggled in alongside a legitimate accept.
    await assertFails(
      updateDoc(doc(bob, `friendEdges/${ID}`), { status: 'accepted', fromName: 'Not Alice' }),
    );
  });

  it('cannot be un-accepted, or accepted twice', async () => {
    await seed(`friendEdges/${ID}`, edgeDoc(ALICE, BOB, { status: 'accepted', toName: 'Bob' }));
    const bob = env.authenticatedContext(BOB).firestore();

    await assertFails(updateDoc(doc(bob, `friendEdges/${ID}`), { status: 'pending' }));
    await assertFails(updateDoc(doc(bob, `friendEdges/${ID}`), { status: 'accepted' }));
  });

  it('lets either side leave, and nobody else', async () => {
    await seed(`friendEdges/${ID}`, edgeDoc(ALICE, BOB, { status: 'accepted' }));

    await assertFails(
      deleteDoc(doc(env.authenticatedContext('carol').firestore(), `friendEdges/${ID}`)),
    );
    await assertSucceeds(
      deleteDoc(doc(env.authenticatedContext(BOB).firestore(), `friendEdges/${ID}`)),
    );
  });
});

describe('library', () => {
  it('is readable by anyone, signed in or not', async () => {
    await seed('library/ppl-push', { name: 'Push day', slots: [] });

    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'library/ppl-push')));
    await assertSucceeds(getDocs(collection(env.unauthenticatedContext().firestore(), 'library')));
    await assertSucceeds(
      getDocs(collection(env.authenticatedContext(ALICE).firestore(), 'library')),
    );
  });

  it('refuses every client write, because there is no submission path', async () => {
    await seed('library/ppl-push', { name: 'Push day', slots: [] });
    const alice = env.authenticatedContext(ALICE).firestore();

    await assertFails(setDoc(doc(alice, 'library/mine'), { name: 'Mine', slots: [] }));
    await assertFails(updateDoc(doc(alice, 'library/ppl-push'), { name: 'HACKED' }));
    await assertFails(deleteDoc(doc(alice, 'library/ppl-push')));
  });
});

describe('everything else', () => {
  it('is closed, so a new collection is denied until it is thought about', async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, 'somethingNew/x'), { a: 1 }));
    await assertFails(getDoc(doc(alice, 'somethingNew/x')));
  });
});
