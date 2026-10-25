import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { setName } from '@lift/data/mutations/profile';
import { hasName, nameProblem, splitName } from '@lift/domain/person';

/**
 * Asks an account with no name for one, once.
 *
 * Sign-up asks for a name now, but an account made before that, or with
 * Google (which hands over one display name, not two), has none. Both halves
 * are required, so this cannot be dismissed; it is prefilled from the Google
 * name where there is one, which makes it one tap for most people.
 */
export function NamePrompt() {
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
    <Modal
      opened={open}
      onClose={() => undefined}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      title="What should we call you?"
    >
      <Stack data-testid="name-prompt">
        <Text size="sm" c="dimmed">
          Your first and last name make your profile icon, and show in Settings. Your friend code
          shows its own name, which you can set separately.
        </Text>
        <TextInput
          label="First name"
          autoComplete="given-name"
          required
          data-autofocus
          value={shownFirst}
          onChange={(event) => {
            setError(null);
            setFirst(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <TextInput
          label="Last name"
          autoComplete="family-name"
          required
          value={shownLast}
          error={error}
          onChange={(event) => {
            setError(null);
            setLast(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <Button onClick={save}>Save</Button>
      </Stack>
    </Modal>
  );
}
