import { describe, expect, it } from 'vitest';
import { accountPhoto, cleanName, hasName, initials, nameProblem, splitName } from './person';

describe('cleanName', () => {
  it('capitalises each part', () => {
    expect(cleanName('test')).toBe('Test');
    expect(cleanName('ebersole sunderland')).toBe('Ebersole Sunderland');
    expect(cleanName('ebersole-sunderland')).toBe('Ebersole-Sunderland');
  });

  it('keeps a capital inside a part', () => {
    expect(cleanName('McDonald')).toBe('McDonald');
  });

  it('capitalises letters outside A–Z', () => {
    expect(cleanName('élodie')).toBe('Élodie');
  });

  it('collapses spaces, and drops them around a hyphen', () => {
    expect(cleanName('  ebersole   sunderland ')).toBe('Ebersole Sunderland');
    expect(cleanName('ebersole - sunderland')).toBe('Ebersole-Sunderland');
  });
});

describe('nameProblem', () => {
  it('accepts letters, with a space or hyphen between parts', () => {
    expect(nameProblem('jerrod', 'ebersole sunderland')).toBeNull();
    expect(nameProblem('Jerrod', 'Ebersole-Sunderland')).toBeNull();
  });

  it('refuses blank and whitespace', () => {
    expect(nameProblem('', '')).toBe('Enter your first and last name.');
    expect(nameProblem('   ', 'Smith')).toBe('Enter your first name.');
    expect(nameProblem('Jo', ' \t ')).toBe('Enter your last name.');
  });

  it('accepts accents, apostrophes, periods and other alphabets', () => {
    expect(nameProblem('José', 'García')).toBeNull();
    expect(nameProblem('Zoë', "O'Brien")).toBeNull();
    expect(nameProblem('Martin', 'Luther Jr.')).toBeNull();
    expect(nameProblem('明', '李')).toBeNull();
  });

  it('refuses numbers, and a part that does not start with a letter', () => {
    expect(nameProblem('J0hn', 'Smith')).toMatch(/first name has to start with a letter/u);
    expect(nameProblem('John', '42')).toMatch(/last name has to start with a letter/u);
    expect(nameProblem('John', "'Neil")).toMatch(/last name has to start with a letter/u);
    expect(nameProblem('John', '-')).toMatch(/last name has to start with a letter/u);
    expect(nameProblem('John', 'Smith--Jones')).toMatch(/last name has to start with a letter/u);
  });

  it('agrees with hasName', () => {
    expect(hasName({ firstName: 'Test', lastName: 'User' })).toBe(true);
    expect(hasName({ firstName: 'Test', lastName: '42' })).toBe(false);
  });
});

describe('initials and splitName', () => {
  it('reads capitalised initials from a lowercase name', () => {
    expect(initials({ firstName: 'jerrod', lastName: 'sunderland' })).toBe('JS');
  });

  it('splits and capitalises a display name', () => {
    expect(splitName('mary anne smith')).toEqual({ firstName: 'Mary', lastName: 'Anne Smith' });
  });
});

describe('accountPhoto', () => {
  it("prefers the account's own photo", () => {
    expect(accountPhoto({ photoURL: 'own', providerData: [{ photoURL: 'google' }] })).toBe('own');
  });

  it('falls back to a linked sign-in', () => {
    expect(
      accountPhoto({ photoURL: null, providerData: [{ photoURL: null }, { photoURL: 'google' }] }),
    ).toBe('google');
  });

  it('is null with no photo anywhere, so the initials show', () => {
    expect(accountPhoto({ photoURL: '', providerData: [{}] })).toBeNull();
    expect(accountPhoto(null)).toBeNull();
  });
});
