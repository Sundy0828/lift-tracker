import { Alert, Badge, Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useProfile } from '@/data/hooks/useProfile';
import { requestFriend } from '@/data/mutations/friends';
import { formatCode, normalizeCode } from '@/domain/friends';

/**
 * Where a scanned friend QR lands (see `FriendQr`).
 *
 * The code arrives in the URL, so there is nothing to type — but the request
 * is still a button. Sending one the moment a link opens would mean a QR
 * pointed at a phone could connect two accounts with no one agreeing to it.
 *
 * Behind `RequireAuth` like the rest of the app: a connection needs an account
 * on both ends, and there is nothing useful to show somebody without one.
 */
export default function FriendLinkScreen() {
  const { code: raw = null } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { profile, isPending } = useProfile();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const code = raw === null ? null : normalizeCode(raw);

  // Nothing to do here once it has gone through — Settings is where the list
  // lives, and leaving them on a dead-end screen is worse than moving them.
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => {
      void navigate('/friends');
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [sent, navigate]);

  if (code === null) {
    return (
      <Stack>
        <Title order={2}>Friend code</Title>
        <Alert color="gray" variant="light" title="That is not a code">
          <Text size="sm">
            A code is eight letters and digits. Either the link was mistyped, or it is not one of
            ours.
          </Text>
        </Alert>
        <Button component={Link} to="/friends" variant="light">
          Back to friends
        </Button>
      </Stack>
    );
  }

  if (isPending) return <Skeleton height={220} radius="md" />;

  const send = async (): Promise<void> => {
    if (uid === null) return;
    setBusy(true);
    setError(null);
    const result = await requestFriend(uid, profile.displayName, code);
    setBusy(false);

    if ('error' in result) {
      setError(describe(result.error));
      return;
    }
    setSent(true);
    notifications.show({
      message:
        result.outcome === 'accepted'
          ? 'They had already asked — you are connected'
          : 'Request sent',
      color: 'teal',
    });
  };

  return (
    <Stack>
      <Title order={2}>Friend code</Title>

      <Card withBorder>
        <Stack gap="sm" align="flex-start">
          <Badge size="lg" variant="light" color="sky" style={{ letterSpacing: '0.08em' }}>
            {formatCode(code)}
          </Badge>

          <Text size="sm" c="dimmed">
            Sending a request lets the two of you share workouts with each other. It shows them
            nothing else — not your sessions, not your records, not what you lifted today.
          </Text>

          {error === null ? null : (
            <Alert variant="light" color="red" w="100%">
              <Text size="sm">{error}</Text>
            </Alert>
          )}

          {sent ? (
            <Text size="sm">Done. Taking you to your friends.</Text>
          ) : (
            <Group gap="xs">
              <Button loading={busy} onClick={() => void send()}>
                Send request
              </Button>
              <Button component={Link} to="/friends" variant="subtle" color="gray">
                Not now
              </Button>
            </Group>
          )}

          {sent ? null : (
            <Text size="xs" c="dimmed">
              {/* Whether you already know them cannot be told from here: the
                  code has to be resolved on the server first. Sending says so
                  rather than making a second request. */}
              If you have already asked each other, this says so rather than asking twice.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

function describe(error: 'not-found' | 'yourself' | 'already' | 'pending' | 'unavailable'): string {
  if (error === 'not-found') return 'No account holds that code. Ask them to send it again.';
  if (error === 'yourself') return 'That is your own code.';
  if (error === 'already') return 'You are already connected to them.';
  if (error === 'pending') return 'You have already asked. They have not answered yet.';
  return 'Could not reach the server. Sending a request needs a connection.';
}
