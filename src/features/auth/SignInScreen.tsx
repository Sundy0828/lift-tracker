import {
  Alert,
  Button,
  Card,
  Divider,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useEmulators } from '@/data/firebase';

type Mode = 'sign-in' | 'register' | 'reset';

const TITLES: Record<Mode, string> = {
  'sign-in': 'Sign in',
  register: 'Create account',
  reset: 'Send reset link',
};

function messageFor(error: unknown): string {
  if (error instanceof Error) {
    // Firebase codes read like `auth/invalid-credential`.
    const match = /auth\/([a-z-]+)/.exec(error.message);
    const code = match?.[1];
    if (code === 'invalid-credential' || code === 'wrong-password') {
      return 'That email and password do not match.';
    }
    if (code === 'email-already-in-use') return 'That email already has an account.';
    if (code === 'account-exists-with-different-credential') {
      // Firebase keeps one account per address, so this is not a clash of two
      // accounts — it is one account being reached by the wrong door.
      return 'That address already signs in with a password. Sign in that way, then link Google from Settings.';
    }
    if (code === 'too-many-requests') return 'Too many attempts. Wait a minute and try again.';
    if (code === 'weak-password') return 'Use at least 6 characters.';
    if (code === 'popup-closed-by-user') return 'Sign-in window closed.';
    if (code === 'network-request-failed') {
      return 'No connection. Signing in needs network the first time.';
    }
    return error.message;
  }
  return 'Sign-in failed.';
}

export default function SignInScreen() {
  const { status, signInWithGoogle, signInWithEmail, registerWithEmail, sendPasswordReset } =
    useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  if (status === 'signed-in') {
    const from = readFrom(location.state);
    return <Navigate to={from} replace />;
  }

  const switchTo = (next: Mode): void => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await navigate(readFrom(location.state), { replace: true });
    } catch (cause: unknown) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const requestReset = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(email);
      setResetSent(true);
    } catch (cause: unknown) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack maw={420} mx="auto" mt="xl" px="md">
      <Stack gap={4} align="center">
        <Title order={1} size="h2">
          Lift Tracker
        </Title>
        <Text c="dimmed" size="sm" ta="center">
          Plan it, log it, see last time&rsquo;s numbers on every set.
        </Text>
      </Stack>

      <Card withBorder>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === 'reset') {
              void requestReset();
              return;
            }
            void run(() =>
              mode === 'sign-in'
                ? signInWithEmail(email, password)
                : registerWithEmail(email, password),
            );
          }}
        >
          <Stack>
            {mode === 'reset' ? (
              <Text size="sm" c="dimmed">
                Enter the address you signed up with and we will send a link to set a new password.
              </Text>
            ) : null}

            <TextInput
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
              }}
            />

            {mode === 'reset' ? null : (
              <PasswordInput
                label="Password"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.currentTarget.value);
                }}
              />
            )}

            {mode === 'register' ? (
              <Text size="xs" c="dimmed">
                At least 6 characters. We will email you a link to confirm the address before you
                can start logging.
              </Text>
            ) : null}

            {resetSent ? (
              <Alert color="green" variant="light" role="status">
                If that address has an account, a reset link is on its way. Check the spam folder if
                it has not arrived in a minute.
              </Alert>
            ) : null}

            {error === null ? null : (
              <Alert color="red" variant="light" role="alert">
                {error}
              </Alert>
            )}

            <Button type="submit" loading={busy} fullWidth>
              {TITLES[mode]}
            </Button>

            {mode === 'sign-in' ? (
              <Button
                variant="subtle"
                size="compact-sm"
                type="button"
                onClick={() => {
                  switchTo('reset');
                }}
              >
                Forgot your password?
              </Button>
            ) : null}
          </Stack>
        </form>

        {mode === 'reset' ? null : (
          <>
            <Divider my="md" label="or" labelPosition="center" />
            <Button
              variant="default"
              fullWidth
              disabled={busy}
              onClick={() => {
                void run(signInWithGoogle);
              }}
            >
              Continue with Google
            </Button>
          </>
        )}

        <Group justify="center" mt="md">
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => {
              switchTo(mode === 'sign-in' ? 'register' : 'sign-in');
            }}
          >
            {mode === 'sign-in' ? 'Need an account?' : 'Back to sign in'}
          </Button>
        </Group>
      </Card>

      {useEmulators ? (
        <Text size="xs" c="dimmed" ta="center">
          Connected to the local Firebase emulators. Any email and a 6-character password work.
        </Text>
      ) : null}
    </Stack>
  );
}

/** The path RequireAuth bounced us from, if it was a safe in-app path. */
function readFrom(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from: unknown = state.from;
    if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
      return from;
    }
  }
  return '/';
}
