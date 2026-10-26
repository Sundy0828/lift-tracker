/**
 * A person's name, and the initials their avatar shows.
 *
 * First and last name are both required: sign-up asks for them, Settings
 * refuses to blank them, and an account made before they existed is asked
 * once. They are separate from `displayName`, which is what a friend code
 * shows and which you may want to be a nickname.
 */

/** Long enough for any real name, short enough for an avatar's tooltip. */
export const MAX_NAME_LENGTH = 40;

/**
 * One or more parts joined by a single space or hyphen. Each part starts with
 * a letter, in any alphabet, so the avatar's initials are always letters; after
 * that anything but a number goes. "Ebersole-Sunderland", "O'Brien", "José"
 * and "Jr." pass; "J0hn", "-" and "'Neil" do not.
 */
const NAME_PATTERN = /^\p{L}[^\s\p{N}-]*(?:[ -]\p{L}[^\s\p{N}-]*)*$/u;

/**
 * Trimmed, inner whitespace collapsed (and dropped around a hyphen), capped,
 * and each part capitalised: "ebersole-sunderland" reads
 * "Ebersole-Sunderland". Only the first letter of a part is raised, so
 * "McDonald" keeps its inner capital.
 */
export function cleanName(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/ ?- ?/gu, '-')
    .slice(0, MAX_NAME_LENGTH)
    .replace(
      /(^|[ -])(\p{Ll})/gu,
      (_, before: string, letter: string) => before + letter.toUpperCase(),
    );
}

/** Why one half of a name is refused, or null when it is fine. */
export function namePartProblem(value: string, part: 'first' | 'last'): string | null {
  const cleaned = cleanName(value);
  if (cleaned === '') return `Enter your ${part} name.`;
  if (!NAME_PATTERN.test(cleaned)) {
    return `Your ${part} name has to start with a letter, and cannot contain numbers.`;
  }
  return null;
}

/** Why a name is refused, or null when it is fine. */
export function nameProblem(first: string, last: string): string | null {
  if (cleanName(first) === '' && cleanName(last) === '') return 'Enter your first and last name.';
  return namePartProblem(first, 'first') ?? namePartProblem(last, 'last');
}

export function hasName(person: { firstName: string; lastName: string }): boolean {
  return nameProblem(person.firstName, person.lastName) === null;
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${cleanName(person.firstName)} ${cleanName(person.lastName)}`.trim();
}

/**
 * Up to two letters: first and last initial, `JS` for Jerrod Sunderland.
 *
 * Falls back to the email's first letter, then `?`, so an avatar is never
 * blank. The first *letter*, not the first code unit, so a name starting
 * with an accent or an emoji is not cut in half.
 */
export function initials(
  person: { firstName: string; lastName: string },
  email: string | null = null,
): string {
  const first = Array.from(cleanName(person.firstName))[0] ?? '';
  const last = Array.from(cleanName(person.lastName))[0] ?? '';
  const both = `${first}${last}`.toUpperCase();
  if (both !== '') return both;
  const fromEmail = Array.from(email ?? '')[0];
  return fromEmail === undefined ? '?' : fromEmail.toUpperCase();
}

/**
 * A first guess at first and last name from a single display name (a Google
 * account's), for prefilling the question. Everything after the first word is
 * the last name: "Mary Anne Smith" guesses Mary / Anne Smith, and is asked.
 */
export function splitName(displayName: string | null): { firstName: string; lastName: string } {
  const words = cleanName(displayName ?? '')
    .split(' ')
    .filter((word) => word !== '');
  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
}

/** What `accountPhoto` reads: the shape both Firebase SDKs give a signed-in user. */
export type PhotoSource = {
  photoURL?: string | null;
  providerData: readonly { photoURL?: string | null }[];
};

/**
 * The picture for someone's avatar: the account's own photo, else the first
 * linked sign-in's (an email account that later linked Google has its photo
 * only there). Null means initials.
 */
export function accountPhoto(user: PhotoSource | null): string | null {
  if (user === null) return null;
  const own = user.photoURL ?? null;
  if (own !== null && own !== '') return own;
  for (const provider of user.providerData) {
    const photo = provider.photoURL ?? null;
    if (photo !== null && photo !== '') return photo;
  }
  return null;
}
