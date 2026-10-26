import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { requestFriend } from '@lift/data/mutations/friends';
import { formatCode, normalizeCode } from '@lift/domain/friends';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { describeRequestError } from '../../../components/friends/FriendsCard';
import { Screen } from '../../../components/Screen';
import { Body, Button, Card, Loading, Notice, Row, Small, Title } from '../../../components/ui';
import { usePalette } from '../../../theme';

/**
 * Where a scanned friend QR lands: the web's `FriendLinkScreen`. The phone's
 * camera opens the web URL, and app links bring it here.
 *
 * The code arrives in the link, but the request is still a button. Sending it
 * the moment a link opens would let a QR pointed at a phone connect two
 * accounts with nobody agreeing to it.
 */
export default function FriendLink() {
  const palette = usePalette();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { profile, isPending } = useProfile();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const code = normalizeCode(raw);

  // Nothing to do here once it has gone through; the list lives on Friends.
  useEffect(() => {
    if (sent === null) return;
    const timer = setTimeout(() => {
      router.replace('/friends');
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [sent]);

  if (code === null) {
    return (
      <Screen>
        <Title>Friend code</Title>
        <Notice tone="gray" title="That is not a code">
          A code is eight letters and digits. Either the link was mistyped, or it is not one of
          ours.
        </Notice>
        <Button
          variant="subtle"
          label="Back to friends"
          onPress={() => {
            router.replace('/friends');
          }}
        />
      </Screen>
    );
  }

  if (isPending) return <Loading />;

  const send = async (): Promise<void> => {
    if (uid === null) return;
    setBusy(true);
    setError(null);
    const result = await requestFriend(uid, profile.displayName, code);
    setBusy(false);
    if ('error' in result) {
      setError(describeRequestError(result.error));
      return;
    }
    setSent(
      result.outcome === 'accepted'
        ? 'They had already asked — you are connected. Taking you to your friends.'
        : 'Request sent. Taking you to your friends.',
    );
  };

  return (
    <Screen>
      <Title>Friend code</Title>
      <Card>
        <Text style={[styles.code, { color: palette.accent }]}>{formatCode(code)}</Text>
        <Body dimmed>
          Sending a request lets the two of you share workouts with each other. It shows them
          nothing else — not your sessions, not your records, not what you lifted today.
        </Body>
        {error === null ? null : <Notice tone="danger">{error}</Notice>}
        {sent === null ? (
          <>
            <Row gap={8}>
              <Button label="Send request" busy={busy} onPress={() => void send()} />
              <Button
                variant="subtle"
                label="Not now"
                onPress={() => {
                  router.replace('/friends');
                }}
              />
            </Row>
            {/* Whether you already know them needs the server to resolve the
                code; sending says so rather than asking twice. */}
            <Small>
              If you have already asked each other, this says so rather than asking twice.
            </Small>
          </>
        ) : (
          <Body>{sent}</Body>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 20, fontWeight: '700', letterSpacing: 1.5 },
});
