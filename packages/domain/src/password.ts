/**
 * The password policy, in one place.
 *
 * Firebase's own rule is six characters and nothing else, so every requirement
 * past that one is ours to state and ours to check. It is checked here, in
 * front of the field, because `auth/weak-password` comes back as a single
 * opaque code: it cannot say which requirement was missed, and a password
 * rejected without saying why is a dead end for the person typing it.
 *
 * The character set is a whitelist rather than a blocklist. Anything outside
 * letters, digits, and {@link SPECIALS} — a space, a dash, an accented letter,
 * an emoji — is refused at the field instead of being accepted here and then
 * failing to type on some other keyboard later.
 *
 * One door this cannot cover: **"forgot password"** sets the new one on
 * Firebase's own hosted action page, which is not our code and enforces only
 * Firebase's six-character rule. Closing that gap means turning on the
 * Identity Platform password policy in the Firebase console — the same rules,
 * stated a second time, where the server can apply them. Until then this is
 * the policy for sign-up, adding a password, and changing one.
 */

/** Firebase will not accept fewer than six; the account policy asks for eight. */
export const MIN_LENGTH = 8;

/** Firebase's own ceiling. Stated so a paste of something huge fails clearly. */
export const MAX_LENGTH = 4096;

/** The only punctuation a password may contain. */
export const SPECIALS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~`';

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

const ALLOWED = LOWERCASE + UPPERCASE + DIGITS + SPECIALS;

export type RequirementId = 'length' | 'lowercase' | 'uppercase' | 'number' | 'special';

export type Requirement = {
  readonly id: RequirementId;
  /** Phrased as the thing the password must have, for a checklist. */
  readonly label: string;
  readonly met: boolean;
};

function has(password: string, characters: string): boolean {
  for (const character of password) {
    if (characters.includes(character)) return true;
  }
  return false;
}

/**
 * Each rule and whether this password meets it, in the order they read.
 *
 * Every rule is reported, not just the first failure: a checklist that reveals
 * one requirement at a time makes choosing a password a guessing game.
 */
export function requirements(password: string): readonly Requirement[] {
  return [
    {
      id: 'length',
      label: `${String(MIN_LENGTH)} characters or more`,
      met: password.length >= MIN_LENGTH && password.length <= MAX_LENGTH,
    },
    { id: 'lowercase', label: 'a lowercase letter', met: has(password, LOWERCASE) },
    { id: 'uppercase', label: 'an uppercase letter', met: has(password, UPPERCASE) },
    { id: 'number', label: 'a number', met: has(password, DIGITS) },
    { id: 'special', label: `a special character (${SPECIALS})`, met: has(password, SPECIALS) },
  ];
}

/**
 * The characters this password may not contain, each listed once.
 *
 * Named back to the user rather than counted: "remove the space" is something
 * you can do, "invalid characters" is something you have to hunt for.
 */
export function disallowedCharacters(password: string): readonly string[] {
  const found: string[] = [];
  for (const character of password) {
    if (!ALLOWED.includes(character) && !found.includes(character)) found.push(character);
  }
  return found;
}

export function isAcceptable(password: string): boolean {
  return (
    password.length <= MAX_LENGTH &&
    disallowedCharacters(password).length === 0 &&
    requirements(password).every((requirement) => requirement.met)
  );
}

/**
 * Why this password cannot be used, or `null` if it can.
 *
 * For the one-line error a form shows after a submit. The checklist covers the
 * missing-requirement case while typing, so this leads with the two problems a
 * checklist cannot express: characters that are not allowed, and a length no
 * amount of adding will fix.
 */
export function problem(password: string): string | null {
  if (password.length > MAX_LENGTH) {
    return `Passwords are at most ${String(MAX_LENGTH)} characters.`;
  }

  const disallowed = disallowedCharacters(password);
  if (disallowed.length > 0) {
    const list = disallowed.map((character) => `"${character}"`).join(' ');
    return `${list} cannot be used in a password. Allowed: letters, numbers, and ${SPECIALS}`;
  }

  const missing = requirements(password).filter((requirement) => !requirement.met);
  if (missing.length === 0) return null;

  return `That password still needs ${joinWords(missing.map((requirement) => requirement.label))}.`;
}

/** A one-line statement of the policy, for a field's description. */
export const SUMMARY =
  `At least ${String(MIN_LENGTH)} characters, ` +
  'with an uppercase letter, a lowercase letter, a number, and a special character.';

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')}, and ${String(words.at(-1))}`;
}
