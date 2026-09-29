/**
 * Friend codes — the sharing-only version (IDEAS §4.1).
 *
 * A code is a short string you hand someone so they can send you a workout.
 * **That is all a friendship does here.** It carries no progress visibility, so
 * no rule has to describe which slice of your history a friend may read, and
 * `firestore.rules` keeps the single ownership check that makes it auditable.
 *
 * **A connection takes both sides.** Entering someone's code sends a request;
 * they accept it or they do not. Nothing appears in anyone's list because a
 * stranger typed eight characters at them.
 *
 * **A code is permanent.** It is the account's address: printed on a QR, read
 * aloud across a gym, saved in somebody's notes. A code that can change is one
 * that stops working for everyone who wrote it down, so there is no way to
 * change it — removing a friend is the operation that was actually wanted.
 */

/**
 * The alphabet a code is drawn from.
 *
 * No `0`, `O`, `1`, `I` or `L`: the code gets read aloud across a gym floor
 * and typed by someone else, and those five are where that goes wrong.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const CODE_LENGTH = 8;

/**
 * A fresh code.
 *
 * 31^8 is about 850 billion, and codes are only ever looked up one at a time
 * by someone who was told one — there is no listing, so nothing can sweep the
 * space. `random` is injected so tests are not left guessing.
 */
export function newFriendCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)] ?? '2';
  }
  return code;
}

/**
 * A typed code as it is stored, or null when it cannot be one.
 *
 * Case and separators are forgiven — `abcd-efgh` and `ABCDEFGH` are the same
 * code — because the code is transcribed by hand and a rejection at this point
 * reads as "your friend gave you a bad code".
 */
export function normalizeCode(input: string): string | null {
  const stripped = input.toUpperCase().replace(/[^0-9A-Z]/gu, '');
  if (stripped.length !== CODE_LENGTH) return null;
  for (const character of stripped) {
    if (!ALPHABET.includes(character)) return null;
  }
  return stripped;
}

/** `ABCD-EFGH`. Split in the middle, which is what makes it readable aloud. */
export function formatCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** A row of the public `friendCodes` collection. */
export type FriendCode = {
  code: string;
  uid: string;
  /** What the sender sees. Chosen by the owner; never their email. */
  displayName: string;
  createdAt: string | null;
};

export const FRIEND_STATUSES = ['pending', 'accepted'] as const;
export type FriendStatus = (typeof FRIEND_STATUSES)[number];

/**
 * One connection between two accounts, request and friendship in one document.
 *
 * **The request becomes the friendship** rather than being traded for rows in
 * two private inboxes. Accepting is a status change on a document both sides
 * can already read, so nobody ever writes into anybody else's tree and the
 * ownership rule stays untouched.
 *
 * `uids` is the sorted pair, which is both the document id and the only field
 * a query needs: one `array-contains` returns your requests in, your requests
 * out, and your friends.
 */
export type FriendEdge = {
  id: string;
  /** Sorted, so the pair has exactly one document whoever asks first. */
  uids: [string, string];
  fromUid: string;
  toUid: string;
  fromName: string;
  /** Empty until the other side accepts and stamps their own name. */
  toName: string;
  status: FriendStatus;
  createdAt: string | null;
  respondedAt: string | null;
};

/**
 * The one document id a pair can have.
 *
 * Sorted, so A asking B and B asking A collide on the same id. That collision
 * is the feature: the second create fails, the client reads what is there, and
 * two people who asked each other at once end up friends rather than holding
 * two mirror-image requests.
 */
export function edgeId(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('_');
}

/** The pair as the document stores it. */
export function edgeUids(a: string, b: string): [string, string] {
  const [first = a, second = b] = [a, b].sort((left, right) => left.localeCompare(right));
  return [first, second];
}

/** The account on the other end, from your point of view. */
export function otherUid(edge: FriendEdge, me: string): string {
  return edge.fromUid === me ? edge.toUid : edge.fromUid;
}

/** Their chosen name, or a placeholder until they have stamped one. */
export function otherName(edge: FriendEdge, me: string): string {
  const name = edge.fromUid === me ? edge.toName : edge.fromName;
  return name === '' ? 'A lifter' : name;
}

/** Requests waiting on you. */
export function incoming(edges: readonly FriendEdge[], me: string): FriendEdge[] {
  return edges.filter((edge) => edge.status === 'pending' && edge.toUid === me);
}

/** Requests you have sent and nobody has answered. */
export function outgoing(edges: readonly FriendEdge[], me: string): FriendEdge[] {
  return edges.filter((edge) => edge.status === 'pending' && edge.fromUid === me);
}

/** Connections both sides agreed to, sorted by the name you see. */
export function friends(edges: readonly FriendEdge[], me: string): FriendEdge[] {
  return edges
    .filter((edge) => edge.status === 'accepted')
    .sort((a, b) => otherName(a, me).localeCompare(otherName(b, me)));
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Narrows a code document. Null when it names no account. */
export function parseFriendCode(
  code: string,
  data: Record<string, unknown> | undefined,
): FriendCode | null {
  if (data === undefined) return null;

  const uid = asString(data['uid']);
  if (uid === '') return null;

  return {
    code,
    uid,
    displayName: asString(data['displayName'], 'A lifter'),
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : null,
  };
}

/** Narrows a connection document. Null when it names no pair. */
export function parseFriendEdge(
  id: string,
  data: Record<string, unknown> | undefined,
): FriendEdge | null {
  if (data === undefined) return null;

  const fromUid = asString(data['fromUid']);
  const toUid = asString(data['toUid']);
  if (fromUid === '' || toUid === '' || fromUid === toUid) return null;

  const status = asString(data['status']);

  return {
    id,
    uids: edgeUids(fromUid, toUid),
    fromUid,
    toUid,
    fromName: asString(data['fromName']),
    toName: asString(data['toName']),
    // Anything unrecognised reads as pending: a connection nobody has agreed
    // to is the safe way to misread a document.
    status: status === 'accepted' ? 'accepted' : 'pending',
    createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : null,
    respondedAt: typeof data['respondedAt'] === 'string' ? data['respondedAt'] : null,
  };
}

/** Longest name a code row will carry, so a list row cannot be flooded. */
export const MAX_DISPLAY_NAME = 40;

/**
 * A display name fit to store: trimmed, collapsed and capped.
 *
 * Empty is allowed and becomes a placeholder at read time — a name is a
 * courtesy to whoever holds your code, not an identity.
 */
export function cleanDisplayName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').slice(0, MAX_DISPLAY_NAME);
}
