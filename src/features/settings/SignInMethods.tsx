import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  PasswordInput,
  Stack,
  Text,
} from '@mantine/core';
import { useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';
import {
  GOOGLE_PROVIDER,
  PASSWORD_PROVIDER,
  linkGoogle,
  linkPassword,
  unlinkProvider,
} from '@/data/mutations/account';

/**
 * The ways into this account, and adding more of them.
 *
 * One account, several doors. Firebase keys an account on its email address,
 * so linking Google to a password account does not merge two accounts — it
 * adds a second way into the one that already holds every workout and session.
 * Nothing moves, nothing is copied, and the uid stays the same, which is what
 * makes this safe to offer next to the data it protects.
 *
 * There is deliberately no automatic linking. Silently attaching a Google
 * identity to whatever password account shares its address means an email
 * you do not control can become a way into your data — and the moment to catch
 * that is a button someone pressed on purpose.
 */

function describe(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;

  if (code === 'auth/credential-already-in-use') {
    return 'That Google account is already attached to a different Lift Tracker account. Sign in to that one instead, or unlink it there first.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'That address already has its own account, so it cannot also be a password for this one.';
  }
  if (code === 'auth/provider-already-linked') return 'That is already linked.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'The Google window closed before it finished. Nothing changed.';
  }
  if (code === 'auth/weak-password') return 'The password needs at least 6 characters.';
  if (code === 'auth/requires-recent-login') {
    return 'For safety this needs a fresh sign-in. Sign out, sign back in, and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'No connection, so nothing changed. Try again once you are back online.';
  }
  return cause instanceof Error ? cause.message : 'Something went wrong. Nothing changed.';
}

export function SignInMethods() {
  const { user, providerIds, refreshUser } = useAuth();

  const hasGoogle = providerIds.includes(GOOGLE_PROVIDER);
  const hasPassword = providerIds.includes(PASSWORD_PROVIDER);
  const onlyOne = providerIds.length <= 1;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [addingPassword, setAddingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const run = async (action: () => Promise<void>, success: string): Promise<void> => {
    if (user === null) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await action();
      await refreshUser();
      setDone(success);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  };

  const closeAddPassword = (): void => {
    if (busy) return;
    setAddingPassword(false);
    setPassword('');
    setConfirm('');
    setError(null);
  };

  const submitPassword = async (): Promise<void> => {
    if (user === null) return;
    await run(
      () => linkPassword(user, password),
      'Password added. You can now sign in with either your email and password or Google.',
    );
    closeAddPassword();
  };

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text fw={600}>Sign-in methods</Text>
        <Text size="sm" c="dimmed">
          Adding a second one does not create a second account — it is another way into this one,
          with all the same data behind it.
        </Text>

        {done === null ? null : (
          <Alert
            variant="light"
            color="green"
            withCloseButton
            onClose={() => {
              setDone(null);
            }}
          >
            <Text size="sm">{done}</Text>
          </Alert>
        )}
        {error === null ? null : (
          <Alert variant="light" color="red" title="Nothing changed">
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        <Group justify="space-between" wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                Email and password
              </Text>
              <Badge size="xs" variant="light" color={hasPassword ? 'green' : 'gray'}>
                {hasPassword ? 'on' : 'off'}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" truncate>
              {user?.email ?? 'No address'}
            </Text>
          </Stack>
          {hasPassword ? (
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              disabled={busy || onlyOne}
              onClick={() => {
                if (user !== null) {
                  void run(
                    () => unlinkProvider(user, PASSWORD_PROVIDER, ''),
                    'Password removed. Google is now the only way in.',
                  );
                }
              }}
            >
              Remove
            </Button>
          ) : (
            <Button
              size="compact-sm"
              variant="default"
              disabled={busy}
              onClick={() => {
                setDone(null);
                setError(null);
                setAddingPassword(true);
              }}
            >
              Add
            </Button>
          )}
        </Group>

        <Group justify="space-between" wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                Google
              </Text>
              <Badge size="xs" variant="light" color={hasGoogle ? 'green' : 'gray'}>
                {hasGoogle ? 'on' : 'off'}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              {hasGoogle ? 'One tap, no password to remember' : 'Not linked'}
            </Text>
          </Stack>
          {hasGoogle ? (
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              disabled={busy || onlyOne}
              onClick={() => {
                if (user !== null) {
                  void run(
                    () => unlinkProvider(user, GOOGLE_PROVIDER, ''),
                    'Google unlinked. Your email and password still work.',
                  );
                }
              }}
            >
              Remove
            </Button>
          ) : (
            <Button
              size="compact-sm"
              variant="default"
              disabled={busy}
              onClick={() => {
                if (user !== null) {
                  void run(
                    () => linkGoogle(user),
                    'Google linked. Either way in works from now on.',
                  );
                }
              }}
            >
              Link
            </Button>
          )}
        </Group>

        {onlyOne ? (
          <Text size="xs" c="dimmed">
            The last method cannot be removed — an account with no way in keeps its data and locks
            you out of it for good.
          </Text>
        ) : null}
      </Stack>

      <Modal
        opened={addingPassword}
        onClose={closeAddPassword}
        title="Add a password"
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            You will be able to sign in with <strong>{user?.email ?? 'your address'}</strong> and
            this password, as well as with Google.
          </Text>
          <PasswordInput
            label="New password"
            description="At least 6 characters."
            data-autofocus
            autoComplete="new-password"
            value={password}
            disabled={busy}
            onChange={(event) => {
              setPassword(event.currentTarget.value);
            }}
          />
          <PasswordInput
            label="New password again"
            autoComplete="new-password"
            value={confirm}
            disabled={busy}
            error={confirm !== '' && confirm !== password ? 'These do not match.' : null}
            onChange={(event) => {
              setConfirm(event.currentTarget.value);
            }}
          />
          {error === null ? null : (
            <Alert variant="light" color="red">
              <Text size="sm">{error}</Text>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeAddPassword} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={password.length < 6 || password !== confirm}
              onClick={() => {
                void submitPassword();
              }}
            >
              Add password
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
