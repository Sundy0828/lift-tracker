import { Stack, Text } from '@mantine/core';
import { disallowedCharacters, requirements, SPECIALS } from './password';

/**
 * The policy as a live checklist under a new-password field.
 *
 * Three screens ask for a new password — register, add a password, change a
 * password — and before this they each carried their own sentence describing
 * the rules, which is three places for the rules to drift out of step with
 * what is actually enforced. The checklist is the same component in all three,
 * fed by the same {@link requirements} the submit button is gated on.
 *
 * Nothing is shown until the first keystroke: a form that opens already
 * covered in red marks reads as five errors made before typing anything.
 */
export function PasswordRequirements({ password }: { password: string }) {
  if (password === '') return null;

  const disallowed = disallowedCharacters(password);

  return (
    <Stack gap={2} role="status" aria-label="Password requirements">
      {requirements(password).map((requirement) => (
        <Text key={requirement.id} size="xs" c={requirement.met ? 'green' : 'dimmed'}>
          {/* The word carries the state too — colour alone is not a signal. */}
          <span aria-hidden>{requirement.met ? '✓ ' : '• '}</span>
          {requirement.met ? 'Has ' : 'Needs '}
          {requirement.label}
        </Text>
      ))}
      {disallowed.length === 0 ? null : (
        <Text size="xs" c="red">
          <span aria-hidden>{'• '}</span>
          Remove {disallowed.map((character) => `"${character}"`).join(' ')} — a password can hold
          letters, numbers, and {SPECIALS}
        </Text>
      )}
    </Stack>
  );
}
