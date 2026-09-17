import { Timestamp, deleteDoc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { FriendCode, FriendEdge } from '@/domain/friends';
import {
  cleanDisplayName,
  edgeId,
  edgeUids,
  newFriendCode,
  parseFriendCode,
} from '@/domain/friends';
import { isAccountDeleted } from '../deletedAccounts';
import { paths } from '../paths';

/**
 * Friend codes and the connections they open (IDEAS §4.1).
 *
 * **Two public documents, both small.** `friendCodes/{code}` is the address
 * book: a uid and a chosen name, nothing about training, because it is the one
 * row a stranger can fetch. `friendEdges/{pairId}` is the connection itself —
 * request and friendship in one document, readable by exactly the two accounts
 * it names.
 *
 * Nothing here writes into anybody else's tree. Accepting is a status change
 * on a shared document, which is what lets `users/{uid}` keep the single
 * ownership rule it has always had.
 *
 * These are awaited, unlike most writes in the app: sending a request has to
 * know whether the code resolved, and accepting has to know whether it stuck.
 */

/** Tries this many codes before giving up. A collision needs 31^8 bad luck. */
const MINT_ATTEMPTS = 5;

/**
 * Accounts with a mint in flight, so concurrent mounts claim one code.
 *
 * `useProfile` is subscribed from several screens at once, and each of them
 * sees the same "no code yet" snapshot. Without this they would each claim a
 * different code and the last profile write would win, leaving the others
 * orphaned in a public collection nobody can list to find them again.
 */
const minting = new Set<string>();

export type MintResult = { code: string } | { error: 'unavailable' };

/**
 * Claims a code for this account.
 *
 * The claim is a create on a public document keyed by the code itself, so two
 * people cannot hold one: the rules refuse a write to a code that exists. A
 * collision retries with a fresh code rather than surfacing anything.
 */
export async function mintFriendCode(uid: string, displayName: string): Promise<MintResult> {
  const name = cleanDisplayName(displayName);

  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
    const code = newFriendCode();
    try {
      // Client time, like every other `createdAt` in the app: a pending server
      // timestamp reads back as null from the local cache.
      await setDoc(paths.friendCode(code), { uid, displayName: name, createdAt: Timestamp.now() });
      await setDoc(paths.user(uid), { friendCode: code, displayName: name }, { merge: true });
      return { code };
    } catch {
      // Either the code was taken or the write was refused. Both are worth one
      // more try; only a persistent failure is reported.
    }
  }

  return { error: 'unavailable' };
}

/**
 * Makes sure the account has a code, minting one the first time.
 *
 * A code is not a feature you switch on — it is the account's address, and an
 * account that has to go and create one has a setting where it should have an
 * answer. So this runs off the profile listener rather than a button, and once
 * minted it never changes.
 *
 * Deliberately server-only: claiming a code is a create on a public document,
 * and a queued offline create would collide on reconnect with no way to tell.
 */
export async function ensureFriendCode(
  uid: string,
  existing: string | null,
  displayName: string,
): Promise<void> {
  if (existing !== null || minting.has(uid) || isAccountDeleted(uid)) return;

  minting.add(uid);
  try {
    await mintFriendCode(uid, displayName);
  } finally {
    minting.delete(uid);
  }
}

/**
 * Puts a new name on the account, and on the code row that shows it.
 *
 * The name already recorded on a connection is left alone: it is what the
 * other side agreed to, and rewriting it would mean writing a field the rules
 * let only its own side touch.
 */
export async function setDisplayName(
  uid: string,
  code: string | null,
  displayName: string,
): Promise<void> {
  const name = cleanDisplayName(displayName);
  await setDoc(paths.user(uid), { displayName: name }, { merge: true });
  if (code !== null) await setDoc(paths.friendCode(code), { displayName: name }, { merge: true });
}

export type RequestResult =
  | { outcome: 'sent' }
  /** The other side had already asked, so this accepted instead. */
  | { outcome: 'accepted' }
  | { error: 'not-found' | 'yourself' | 'already' | 'pending' | 'unavailable' };

/**
 * Sends a friend request to whoever holds a code.
 *
 * The lookup is a `get` on one document by id — never a list, which the rules
 * refuse, so the collection cannot be walked as a directory of accounts.
 *
 * **A pair has exactly one document**, keyed by the sorted uids. So two people
 * who enter each other's codes at the same moment collide rather than ending
 * up with mirror-image requests: the second create fails, this reads what is
 * there, and a request addressed to you is simply accepted.
 */
export async function requestFriend(
  uid: string,
  myName: string,
  code: string,
): Promise<RequestResult> {
  let resolved: FriendCode | null;
  try {
    const snapshot = await getDoc(paths.friendCode(code));
    resolved = parseFriendCode(code, snapshot.data());
  } catch {
    return { error: 'unavailable' };
  }

  if (resolved === null) return { error: 'not-found' };
  if (resolved.uid === uid) return { error: 'yourself' };

  const id = edgeId(uid, resolved.uid);

  try {
    await setDoc(paths.friendEdge(id), {
      uids: edgeUids(uid, resolved.uid),
      fromUid: uid,
      toUid: resolved.uid,
      fromName: cleanDisplayName(myName),
      toName: '',
      status: 'pending',
      createdAt: Timestamp.now(),
      respondedAt: null,
    });
    return { outcome: 'sent' };
  } catch {
    // Refused because the pair already has a document. Whether that is a
    // request one of you already sent or a connection you already have is
    // worth saying — and one addressed to you is worth simply accepting.
    return resolveExisting(uid, myName, id);
  }
}

async function resolveExisting(uid: string, myName: string, id: string): Promise<RequestResult> {
  try {
    const snapshot = await getDoc(paths.friendEdge(id));
    const data = snapshot.data();
    if (data === undefined) return { error: 'unavailable' };

    if (data['status'] === 'accepted') return { error: 'already' };
    if (data['toUid'] !== uid) return { error: 'pending' };

    await acceptById(myName, id);
    return { outcome: 'accepted' };
  } catch {
    return { error: 'unavailable' };
  }
}

/** The three fields the rules let a recipient move, and nothing else. */
function acceptById(myName: string, id: string): Promise<void> {
  return updateDoc(paths.friendEdge(id), {
    status: 'accepted',
    toName: cleanDisplayName(myName),
    respondedAt: Timestamp.now(),
  });
}

/** Accepts a request addressed to this account. */
export function acceptFriend(uid: string, myName: string, edge: FriendEdge): Promise<void> {
  if (edge.toUid !== uid) return Promise.resolve();
  return acceptById(myName, edge.id);
}

/**
 * Removes a connection, whatever stage it is at.
 *
 * Declining a request, withdrawing one you sent, and unfriending are all the
 * same write: the pair's one document goes. Either side may do it — a
 * connection nobody can leave is not one anybody should enter.
 */
export function removeFriend(edge: FriendEdge): Promise<void> {
  return deleteDoc(paths.friendEdge(edge.id));
}
