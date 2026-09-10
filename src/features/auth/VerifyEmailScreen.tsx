import { Alert, Button, Card, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';

/**
 * The wall an unconfirmed password account meets.
 *
 * Clicking the link verifies the address on Firebase's servers, in whatever
 * browser the inbox happened to open in. Nothing pushes that back to this tab,
 * so this screen has to go and ask — on a timer while it is open, and on
 * demand from the button, because the timer is a courtesy and the button is
 * the guarantee.
 */

/** Slow enough to be free, fast enough that a click feels like it just worked. */
const POLL_MS = 4000;

function messageFor(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
  if (code === 'auth/too-many-requests') {
    return 'Too many emails requested. Wait a few minutes before trying again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'No connection, so nothing was sent. Try again once you are back online.';
  }
  return cause instanceof Error ? cause.message : 'Could not send the email.';
}

export default function VerifyEmailScreen() {
  const { user, sendVerification, refreshVerification, signOutUser, verificationSend } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      // Failures here are silent on purpose: this is a background courtesy,
      // and an error toast every four seconds offline would be its own bug.
      void refreshVerification().catch(() => false);
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
    // `refreshVerification` is stable between auth state changes, so this
    // restarts the timer only when the signed-in account itself changes.
  }, [refreshVerification]);

  const sendFailed = verificationSend.state === 'failed';
  // One message, newest first: an error from this screen's own button is more
  // recent than the send that registration recorded.
  const problem =
    error ?? (verificationSend.state === 'failed' ? messageFor(verificationSend.cause) : null);

  const resend = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await sendVerification();
      setSent(true);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const check = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // A true result unmounts this screen: the gate above it re-renders.
      await refreshVerification();
      setCheckedAt(Date.now());
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack maw={420} mx="auto" mt="xl" px="md">
      <Stack gap={4} align="center">
        <Title order={1} size="h2">
          Confirm your email
        </Title>
        <Text c="dimmed" size="sm" ta="center">
          We email a link, not a code. One click and you are in.
        </Text>
      </Stack>

      <Card withBorder>
        <Stack>
          {sendFailed ? (
            <Text size="sm">
              We could not send the link to <strong>{user?.email ?? 'your address'}</strong>. Your
              account is made — tap <strong>Send it again</strong> to try once more.
            </Text>
          ) : (
            <>
              <Text size="sm">
                We sent a link to <strong>{user?.email ?? 'your address'}</strong>. Open it and this
                screen will let you through on its own.
              </Text>
              <Text size="sm" c="dimmed">
                Check the spam folder if it is not there after a minute — confirmation mail from a
                new project often lands in it.
              </Text>
            </>
          )}

          {sent ? (
            <Alert color="green" variant="light" role="status">
              Sent again. The newest link is the one that works — older ones stop working when a new
              one is issued.
            </Alert>
          ) : null}

          {checkedAt === null ? null : (
            <Alert color="yellow" variant="light" role="status">
              Still not confirmed. If you just clicked the link, give it a couple of seconds and
              check again.
            </Alert>
          )}

          {problem === null ? null : (
            <Alert color="red" variant="light" role="alert">
              {problem}
            </Alert>
          )}

          <Button
            loading={busy}
            onClick={() => {
              void check();
            }}
          >
            I&rsquo;ve confirmed it
          </Button>
          <Button
            variant="default"
            disabled={busy}
            onClick={() => {
              void resend();
            }}
          >
            Send it again
          </Button>
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            disabled={busy}
            onClick={() => {
              void signOutUser();
            }}
          >
            Sign out
          </Button>
        </Stack>
      </Card>

      <Text size="xs" c="dimmed" ta="center">
        Wrong address? Sign out and create the account again — nothing has been saved to it yet.
      </Text>
    </Stack>
  );
}
