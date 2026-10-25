import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { setName } from '@lift/data/mutations/profile';
import { hasName, nameProblem, splitName } from '@lift/domain/person';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { usePalette } from '../theme';
import { Body, Button, Field, Notice, Title } from './ui';

/**
 * Asks an account with no name for one, once: the web's `NamePrompt`.
 *
 * Sign-up asks for a name now; an older account, or one made with Google on
 * the web, has none. Both halves are required, so this cannot be dismissed.
 * It is prefilled from the account's display name where there is one.
 */
export function NamePrompt() {
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { profile, isPending } = useProfile();
  const guess = splitName(user?.displayName ?? null);
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missing = uid !== null && !isPending && !hasName(profile);
  // A Google account that brings a full name needs no question: it is saved
  // as it is, and stays editable in Settings like any other.
  const fromAccount = nameProblem(guess.firstName, guess.lastName) === null;
  const open = missing && !fromAccount;

  const adopted = useRef(false);
  useEffect(() => {
    if (!missing || !fromAccount || adopted.current) return;
    adopted.current = true;
    void setName(uid, guess.firstName, guess.lastName).catch(() => {
      adopted.current = false;
    });
  }, [missing, fromAccount, uid, guess.firstName, guess.lastName]);
  const shownFirst = first ?? guess.firstName;
  const shownLast = last ?? guess.lastName;

  const save = (): void => {
    if (uid === null) return;
    const problem = nameProblem(shownFirst, shownLast);
    if (problem !== null) {
      setError(problem);
      return;
    }
    void setName(uid, shownFirst, shownLast);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => undefined}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View
          testID="name-prompt"
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Title>What should we call you?</Title>
          <Body dimmed>
            Your first and last name make your profile icon, and show in Settings. Your friend code
            shows its own name, which you can set separately.
          </Body>
          <Field
            testID="prompt-first-name"
            label="First name"
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            value={shownFirst}
            onChangeText={(value) => {
              setError(null);
              setFirst(value);
            }}
          />
          <Field
            testID="prompt-last-name"
            label="Last name"
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            value={shownLast}
            onChangeText={(value) => {
              setError(null);
              setLast(value);
            }}
            onSubmitEditing={save}
            returnKeyType="done"
          />
          {error === null ? null : <Notice tone="danger">{error}</Notice>}
          <Button label="Save" onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
});
