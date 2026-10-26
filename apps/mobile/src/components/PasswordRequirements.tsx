import { disallowedCharacters, requirements, SPECIALS } from '@lift/domain/password';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';

/**
 * The password policy as a live checklist under a new-password field: the
 * web's `PasswordRequirements`, from the same `requirements` the submit button
 * is gated on. Used by register, add a password and change password.
 *
 * Nothing until the first keystroke: a form that opens covered in red marks
 * reads as five errors made before typing anything.
 */
export function PasswordRequirements({ password }: { password: string }) {
  const palette = usePalette();
  if (password === '') return null;
  const disallowed = disallowedCharacters(password);

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel="Password requirements"
      style={styles.list}
    >
      {requirements(password).map((requirement) => (
        <Text
          key={requirement.id}
          style={[styles.item, { color: requirement.met ? palette.up : palette.dimmed }]}
        >
          {/* The word carries the state too: colour alone is not a signal. */}
          {requirement.met ? '✓ Has ' : '• Needs '}
          {requirement.label}
        </Text>
      ))}
      {disallowed.length === 0 ? null : (
        <Text style={[styles.item, { color: palette.down }]}>
          • Remove {disallowed.map((character) => `"${character}"`).join(' ')} — a password can hold
          letters, numbers, and {SPECIALS}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 2 },
  item: { fontSize: 12, lineHeight: 17 },
});
