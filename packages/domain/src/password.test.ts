import { describe, expect, it } from 'vitest';
import {
  disallowedCharacters,
  isAcceptable,
  MAX_LENGTH,
  MIN_LENGTH,
  problem,
  requirements,
  SPECIALS,
} from './password';

/** Meets every rule, so each test can break exactly one of them. */
const GOOD = 'Lift$Tracker1';

const met = (password: string, id: string): boolean =>
  requirements(password).find((requirement) => requirement.id === id)?.met ?? false;

describe('isAcceptable', () => {
  it('accepts a password meeting every rule', () => {
    expect(isAcceptable(GOOD)).toBe(true);
  });

  it('accepts each allowed special character on its own', () => {
    for (const character of SPECIALS) {
      expect(isAcceptable(`Abcdef1${character}`), `${character} should be allowed`).toBe(true);
    }
  });

  it('rejects a password one character short', () => {
    expect(isAcceptable('Abc1$de')).toBe(false);
    expect(isAcceptable('Abc1$def')).toBe(true);
  });

  it('rejects a password past the ceiling', () => {
    expect(isAcceptable(`Ab1$${'c'.repeat(MAX_LENGTH - 4)}`)).toBe(true);
    expect(isAcceptable(`Ab1$${'c'.repeat(MAX_LENGTH - 3)}`)).toBe(false);
  });

  it('rejects a password missing any one class', () => {
    expect(isAcceptable('lift$tracker1')).toBe(false); // no uppercase
    expect(isAcceptable('LIFT$TRACKER1')).toBe(false); // no lowercase
    expect(isAcceptable('Lift$Tracker')).toBe(false); // no number
    expect(isAcceptable('LiftTracker1')).toBe(false); // no special
  });

  it('rejects characters outside the allowed set, even in a strong password', () => {
    // Common near-misses: none of these are on the list.
    for (const character of [' ', '-', '+', '=', 'é', '€', '😀']) {
      expect(isAcceptable(`Lift$Tracker1${character}`), `${character} should be refused`).toBe(
        false,
      );
    }
  });
});

describe('requirements', () => {
  it('reports every rule, not only the first failure', () => {
    const all = requirements('a');
    expect(all).toHaveLength(5);
    expect(all.filter((requirement) => requirement.met)).toHaveLength(1);
  });

  it('names the minimum length in the length rule', () => {
    expect(requirements('').find((requirement) => requirement.id === 'length')?.label).toContain(
      String(MIN_LENGTH),
    );
  });

  it('counts length as unmet once past the ceiling, not met', () => {
    // A too-long password has "enough" characters but must not read as passing.
    expect(met('A1$'.padEnd(MAX_LENGTH + 1, 'c'), 'length')).toBe(false);
  });

  it('is met per class independently of the others', () => {
    expect(met('a', 'lowercase')).toBe(true);
    expect(met('a', 'uppercase')).toBe(false);
    expect(met('7', 'number')).toBe(true);
    expect(met('~', 'special')).toBe(true);
  });
});

describe('disallowedCharacters', () => {
  it('finds nothing in an allowed password', () => {
    expect(disallowedCharacters(GOOD)).toEqual([]);
    expect(disallowedCharacters(SPECIALS)).toEqual([]);
  });

  it('lists each offender once, in the order it first appears', () => {
    expect(disallowedCharacters('a b-c b')).toEqual([' ', '-']);
  });
});

describe('problem', () => {
  it('is null for an acceptable password', () => {
    expect(problem(GOOD)).toBeNull();
  });

  it('leads with the length ceiling, which no addition can fix', () => {
    expect(problem('c'.repeat(MAX_LENGTH + 1))).toContain(String(MAX_LENGTH));
  });

  it('names the characters to remove rather than counting them', () => {
    const message = problem('Lift$Tracker1 ') ?? '';
    expect(message).toContain('" "');
  });

  it('lists every missing requirement in one sentence', () => {
    const message = problem('abcdefgh') ?? '';
    expect(message).toContain('an uppercase letter');
    expect(message).toContain('a number');
    expect(message).toContain('and');
  });
});
