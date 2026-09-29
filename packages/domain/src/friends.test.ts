import { describe, expect, it } from 'vitest';
import type { FriendEdge } from './friends';
import {
  CODE_LENGTH,
  cleanDisplayName,
  edgeId,
  edgeUids,
  formatCode,
  friends,
  incoming,
  newFriendCode,
  normalizeCode,
  otherName,
  otherUid,
  outgoing,
  parseFriendCode,
  parseFriendEdge,
} from './friends';

describe('newFriendCode', () => {
  it('is the stated length', () => {
    expect(newFriendCode()).toHaveLength(CODE_LENGTH);
  });

  it('never uses a character that is misread aloud', () => {
    // Fifty codes is enough to sample every position of the alphabet.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(newFriendCode()).not.toMatch(/[01OIL]/u);
    }
  });

  it('takes its randomness from the caller, so a test can pin it', () => {
    expect(newFriendCode(() => 0)).toBe('22222222');
  });
});

describe('normalizeCode', () => {
  it('forgives case and separators', () => {
    expect(normalizeCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode('ABCD EFGH')).toBe('ABCDEFGH');
    expect(normalizeCode(' abcdefgh ')).toBe('ABCDEFGH');
  });

  it('refuses the wrong length', () => {
    expect(normalizeCode('ABCD')).toBeNull();
    expect(normalizeCode('ABCDEFGHI')).toBeNull();
  });

  it('refuses a character the alphabet does not hold', () => {
    expect(normalizeCode('ABCDEFG0')).toBeNull();
    expect(normalizeCode('ABCDEFGI')).toBeNull();
  });
});

describe('formatCode', () => {
  it('splits it in the middle, which is what makes it readable aloud', () => {
    expect(formatCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('leaves something that is not a code alone', () => {
    expect(formatCode('ABC')).toBe('ABC');
  });
});

describe('parseFriendCode', () => {
  it('reads a row written by the app', () => {
    expect(parseFriendCode('ABCDEFGH', { uid: 'u1', displayName: 'Sam' })).toEqual({
      code: 'ABCDEFGH',
      uid: 'u1',
      displayName: 'Sam',
      createdAt: null,
    });
  });

  it('refuses a row that names no account', () => {
    expect(parseFriendCode('ABCDEFGH', { displayName: 'Sam' })).toBeNull();
    expect(parseFriendCode('ABCDEFGH', { uid: '' })).toBeNull();
    expect(parseFriendCode('ABCDEFGH', undefined)).toBeNull();
  });

  it('stands a placeholder in for a missing name', () => {
    expect(parseFriendCode('ABCDEFGH', { uid: 'u1' })?.displayName).toBe('A lifter');
  });
});

describe('edgeId', () => {
  it('is the same document whichever of the two asks first', () => {
    expect(edgeId('bob', 'alice')).toBe(edgeId('alice', 'bob'));
    expect(edgeId('alice', 'bob')).toBe('alice_bob');
  });

  it('sorts the pair the same way', () => {
    expect(edgeUids('bob', 'alice')).toEqual(['alice', 'bob']);
  });
});

describe('parseFriendEdge', () => {
  it('reads a request the app wrote', () => {
    expect(
      parseFriendEdge('alice_bob', {
        uids: ['alice', 'bob'],
        fromUid: 'alice',
        toUid: 'bob',
        fromName: 'Alice',
        toName: '',
        status: 'pending',
      }),
    ).toMatchObject({ id: 'alice_bob', fromUid: 'alice', toUid: 'bob', status: 'pending' });
  });

  it('refuses one that names no pair', () => {
    expect(parseFriendEdge('x', undefined)).toBeNull();
    expect(parseFriendEdge('x', { fromUid: 'alice' })).toBeNull();
    expect(parseFriendEdge('x', { fromUid: 'alice', toUid: 'alice' })).toBeNull();
  });

  it('reads an unrecognised status as pending, which is the safe misreading', () => {
    const edge = parseFriendEdge('x', { fromUid: 'a', toUid: 'b', status: 'friends-forever' });
    expect(edge?.status).toBe('pending');
  });
});

describe('sorting connections', () => {
  function edge(over: Partial<FriendEdge> = {}): FriendEdge {
    return {
      id: 'alice_bob',
      uids: ['alice', 'bob'],
      fromUid: 'alice',
      toUid: 'bob',
      fromName: 'Alice',
      toName: 'Bob',
      status: 'pending',
      createdAt: null,
      respondedAt: null,
      ...over,
    };
  }

  const all = [
    edge({ id: 'a', fromUid: 'carol', toUid: 'me', fromName: 'Carol' }),
    edge({ id: 'b', fromUid: 'me', toUid: 'dave', fromName: 'Me', toName: 'Dave' }),
    edge({ id: 'c', fromUid: 'me', toUid: 'zoe', toName: 'Zoe', status: 'accepted' }),
    edge({ id: 'd', fromUid: 'amy', toUid: 'me', fromName: 'Amy', status: 'accepted' }),
  ];

  it('splits requests in from requests out', () => {
    expect(incoming(all, 'me').map((one) => one.id)).toEqual(['a']);
    expect(outgoing(all, 'me').map((one) => one.id)).toEqual(['b']);
  });

  it('lists only accepted connections, by the name you see', () => {
    expect(friends(all, 'me').map((one) => one.id)).toEqual(['d', 'c']);
  });

  it('reads the other end from whichever side you are on', () => {
    expect(otherUid(all[0] ?? edge(), 'me')).toBe('carol');
    expect(otherName(all[0] ?? edge(), 'me')).toBe('Carol');
    expect(otherUid(all[1] ?? edge(), 'me')).toBe('dave');
    expect(otherName(all[1] ?? edge(), 'me')).toBe('Dave');
  });

  it('stands a placeholder in for a side that has not named itself', () => {
    expect(otherName(edge({ fromUid: 'me', toUid: 'x', toName: '' }), 'me')).toBe('A lifter');
  });
});

describe('cleanDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanDisplayName('  Sam   Smith ')).toBe('Sam Smith');
  });

  it('caps the length, so a list row cannot be flooded', () => {
    expect(cleanDisplayName('a'.repeat(200))).toHaveLength(40);
  });

  it('allows an empty name, which reads as a placeholder later', () => {
    expect(cleanDisplayName('   ')).toBe('');
  });
});
