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

type Mode = 'sign-in' | 'register';

function messageFor(error: unknown): string {
  if (error instanceof Error) {
    // Firebase codes read like `auth/invalid-credential`.
    const match = /auth\/([a-z-]+)/.exec(error.message);
    const code = match?.[1];
    if (code === 'invalid-credential' || code === 'wrong-password') {
      return 'That email and password do not match.';
    }
    if (code === 'email-already-in-use') return 'That email already has an account.';
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
  const { status, signInWithGoogle, signInWithEmail, registerWithEmail } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signed-in') {
    const from = readFrom(location.state);
    return <Navigate to={from} replace />;
  }

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
            void run(() =>
              mode === 'sign-in'
                ? signInWithEmail(email, password)
                : registerWithEmail(email, password),
            );
          }}
        >
          <Stack>
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
            <PasswordInput
              label="Password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.currentTarget.value);
              }}
            />
            {error === null ? null : (
              <Alert color="red" variant="light" role="alert">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={busy} fullWidth>
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </Button>
          </Stack>
        </form>

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

        <Group justify="center" mt="md">
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => {
              setMode(mode === 'sign-in' ? 'register' : 'sign-in');
              setError(null);
            }}
          >
            {mode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}
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
