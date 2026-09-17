import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';
import { useFriendEdges } from '@/data/hooks/useFriends';
import { useProfile } from '@/data/hooks/useProfile';
import {
  acceptFriend,
  removeFriend,
  requestFriend,
  setDisplayName,
} from '@/data/mutations/friends';
import type { FriendEdge } from '@/domain/friends';
import {
  formatCode,
  friends,
  incoming,
  normalizeCode,
  otherName,
  outgoing,
} from '@/domain/friends';
import { FriendQr } from './FriendQr';

/**
 * Friend codes — sharing only (IDEAS §4.1).
 *
 * The card says what the feature is *not*, because the word "friend" promises
 * more than this does: a connection lets you send each other a workout, and
 * nothing else. No progress is visible in either direction, which is exactly
 * what keeps `firestore.rules` a single ownership check.
 *
 * **Two things are deliberate about the code.** It exists from the moment the
 * account does, so this shows an answer rather than a button; and it never
 * changes, because it is an address — printed on the QR above it, read aloud
 * across a gym, written down in somebody's notes.
 *
 * **A connection takes both sides.** Entering a code sends a request, and the
 * other person accepts it or does not.
 */
export function FriendsCard() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { profile, isPending } = useProfile();
  const { edges } = useFriendEdges();

  const [name, setName] = useState<string | null>(null);
  const [entered, setEntered] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = profile.friendCode;
  const shownName = name ?? profile.displayName;

  const requests = useMemo(() => (uid === null ? [] : incoming(edges, uid)), [edges, uid]);
  const sent = useMemo(() => (uid === null ? [] : outgoing(edges, uid)), [edges, uid]);
  const connected = useMemo(() => (uid === null ? [] : friends(edges, uid)), [edges, uid]);

  const send = async (): Promise<void> => {
    if (uid === null) return;
    const normalized = normalizeCode(entered);
    if (normalized === null) {
      setError('That is not a code. They are eight letters and digits, like ABCD-EFGH.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await requestFriend(uid, shownName, normalized);
    setBusy(false);

    if ('error' in result) {
      setError(describeRequestError(result.error));
      return;
    }
    setEntered('');
    notifications.show({
      message:
        result.outcome === 'accepted'
          ? 'They had already asked — you are connected'
          : 'Request sent',
      color: 'teal',
    });
  };

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text fw={600}>Friends</Text>

        <Text size="sm" c="dimmed">
          A code you hand someone so they can send you a workout. They send a request, you accept
          it, and that is the whole connection — neither of you can see the other&apos;s sessions,
          records or anything else.
        </Text>

        {error === null ? null : (
          <Alert
            variant="light"
            color="red"
            withCloseButton
            onClose={() => {
              setError(null);
            }}
          >
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        {isPending || code === null ? (
          <Text size="sm" c="dimmed">
            {/* Minted from the profile listener, which needs the server — so
                this is what a first run offline looks like, not a failure. */}
            Your code is being set up. It needs a connection the first time.
          </Text>
        ) : (
          <Stack gap="xs" align="flex-start">
            <FriendQr code={code} />

            <Group gap="xs" wrap="nowrap">
              <Badge
                size="lg"
                variant="light"
                color="sky"
                data-testid="friend-code"
                style={{ letterSpacing: '0.08em' }}
              >
                {formatCode(code)}
              </Badge>
              <CopyButton value={formatCode(code)}>
                {({ copied, copy }) => (
                  <Button size="compact-xs" variant="light" onClick={copy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>

            <Text size="xs" c="dimmed">
              Point a phone camera at the code, or read the eight characters out. It is yours for
              good — nothing here changes it, so anyone who wrote it down keeps a working one.
            </Text>

            <TextInput
              label="The name your code shows"
              description="Whoever holds your code sees this. Never your email."
              placeholder="Jerrod"
              w="100%"
              value={shownName}
              onChange={(event) => {
                setName(event.currentTarget.value);
              }}
              onBlur={() => {
                if (uid !== null && shownName !== profile.displayName) {
                  void setDisplayName(uid, code, shownName);
                }
              }}
            />
          </Stack>
        )}

        {requests.length === 0 ? null : (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Wants to connect
            </Text>
            {requests.map((edge) => (
              <Group
                key={edge.id}
                justify="space-between"
                wrap="nowrap"
                data-testid="friend-request"
              >
                <Text size="sm" truncate style={{ minWidth: 0 }}>
                  {uid === null ? '' : otherName(edge, uid)}
                </Text>
                <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                  <Button
                    size="compact-xs"
                    onClick={() => {
                      if (uid !== null) void acceptFriend(uid, shownName, edge);
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => void removeFriend(edge)}
                  >
                    Decline
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>
        )}

        <TextInput
          label="Add someone by their code"
          placeholder="ABCD-EFGH"
          value={entered}
          disabled={busy}
          onChange={(event) => {
            setEntered(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void send();
          }}
        />
        <Group>
          <Button
            variant="default"
            loading={busy}
            disabled={entered === ''}
            onClick={() => void send()}
          >
            Send request
          </Button>
        </Group>

        {sent.length === 0 ? null : (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Waiting on them
            </Text>
            {sent.map((edge) => (
              <EdgeRow key={edge.id} edge={edge} me={uid} label="Withdraw" />
            ))}
          </Stack>
        )}

        {connected.length === 0 ? (
          <Text size="xs" c="dimmed">
            Nobody connected yet. Once someone is, the share panel on a workout can send straight to
            them.
          </Text>
        ) : (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Connected
            </Text>
            {connected.map((edge) => (
              <EdgeRow key={edge.id} edge={edge} me={uid} label="Remove" />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/** One connection, at whatever stage — the control is the only difference. */
function EdgeRow({ edge, me, label }: { edge: FriendEdge; me: string | null; label: string }) {
  return (
    <Group justify="space-between" wrap="nowrap" data-testid="friend-row">
      <Text size="sm" truncate style={{ minWidth: 0 }}>
        {me === null ? '' : otherName(edge, me)}
      </Text>
      <Button
        size="compact-xs"
        variant="subtle"
        color="red"
        style={{ flexShrink: 0 }}
        onClick={() => void removeFriend(edge)}
      >
        {label}
      </Button>
    </Group>
  );
}

/** Why a request did not go through, in terms of what to do about it. */
function describeRequestError(
  error: 'not-found' | 'yourself' | 'already' | 'pending' | 'unavailable',
): string {
  if (error === 'not-found') {
    return 'No account holds that code. Check the letters, or ask them to send it again.';
  }
  if (error === 'yourself') return 'That is your own code.';
  if (error === 'already') return 'You are already connected to them.';
  if (error === 'pending') return 'You have already asked. They have not answered yet.';
  return 'Could not reach the server. Sending a request needs a connection.';
}
