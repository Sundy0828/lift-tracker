import { useAuth } from '@lift/data/hooks/useAuth';
import { useFriendEdges } from '@lift/data/hooks/useFriends';
import { useProfile } from '@lift/data/hooks/useProfile';
import {
  acceptFriend,
  removeFriend,
  requestFriend,
  setDisplayName,
  type RequestResult,
} from '@lift/data/mutations/friends';
import type { FriendEdge } from '@lift/domain/friends';
import {
  formatCode,
  friends,
  incoming,
  normalizeCode,
  otherName,
  outgoing,
} from '@lift/domain/friends';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { friendUrl, shareText } from '../../links';
import { usePalette } from '../../theme';
import { Body, Button, Card, Field, Heading, Notice, Small } from '../ui';
import { FriendQr } from './FriendQr';

type RequestError = Extract<RequestResult, { error: unknown }>['error'];

/** Why a request did not go through, in terms of what to do about it. */
export function describeRequestError(error: RequestError): string {
  if (error === 'not-found') {
    return 'No account holds that code. Check the letters, or ask them to send it again.';
  }
  if (error === 'yourself') return 'That is your own code.';
  if (error === 'already') return 'You are already connected to them.';
  if (error === 'pending') return 'You have already asked. They have not answered yet.';
  return 'Could not reach the server. Sending a request needs a connection.';
}

/**
 * Friend codes, for sharing only: the web's `FriendsCard`.
 *
 * A connection lets two people send each other a workout and nothing else; no
 * progress is visible either way. The code exists from the moment the account
 * does and never changes, because it is an address. A connection takes both
 * sides: a code sends a request, the other person accepts it or does not.
 */
export function FriendsCard() {
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { profile, isPending } = useProfile();
  const { edges } = useFriendEdges();

  const [name, setName] = useState<string | null>(null);
  const [entered, setEntered] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const code = profile.friendCode;
  const shownName = name ?? profile.displayName;

  const requests = useMemo(() => (uid === null ? [] : incoming(edges, uid)), [edges, uid]);
  const sent = useMemo(() => (uid === null ? [] : outgoing(edges, uid)), [edges, uid]);
  const connected = useMemo(() => (uid === null ? [] : friends(edges, uid)), [edges, uid]);

  const send = async (): Promise<void> => {
    if (uid === null) return;
    const normalized = normalizeCode(entered);
    setNotice(null);
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
    setNotice(
      result.outcome === 'accepted' ? 'They had already asked — you are connected' : 'Request sent',
    );
  };

  return (
    <Card>
      <Heading>Friends</Heading>
      <Body dimmed>
        A code you hand someone so they can send you a workout. They send a request, you accept it,
        and that is the whole connection — neither of you can see the other&apos;s sessions, records
        or anything else.
      </Body>

      {error === null ? null : (
        <Notice
          tone="danger"
          onClose={() => {
            setError(null);
          }}
        >
          {error}
        </Notice>
      )}
      {notice === null ? null : (
        <Notice
          tone="success"
          onClose={() => {
            setNotice(null);
          }}
        >
          {notice}
        </Notice>
      )}

      {isPending || code === null ? (
        // Minted from the profile listener, which needs the server: this is
        // what a first run offline looks like, not a failure.
        <Body dimmed>Your code is being set up. It needs a connection the first time.</Body>
      ) : (
        <View style={styles.code}>
          <FriendQr code={code} />
          <View style={styles.codeRow}>
            <Text testID="friend-code" style={[styles.codeText, { color: palette.accent }]}>
              {formatCode(code)}
            </Text>
            <Button
              size="compact"
              variant="subtle"
              label="Send"
              onPress={() => {
                shareText(`My Lift friend code is ${formatCode(code)}: ${friendUrl(code)}`);
              }}
            />
          </View>
          <Small>
            Point a phone camera at the code, or read the eight characters out. It is yours for good
            — nothing here changes it, so anyone who wrote it down keeps a working one.
          </Small>
          <View style={styles.full}>
            <Field
              label="The name your code shows"
              description="Whoever holds your code sees this. Never your email."
              placeholder="Your name"
              value={shownName}
              onChangeText={setName}
              onEndEditing={() => {
                if (uid !== null && shownName !== profile.displayName) {
                  void setDisplayName(uid, code, shownName);
                }
                setName(null);
              }}
            />
          </View>
        </View>
      )}

      {requests.length === 0 ? null : (
        <View style={styles.list}>
          <Heading>Wants to connect</Heading>
          {requests.map((edge) => (
            <View key={edge.id} testID="friend-request" style={styles.edge}>
              <Text numberOfLines={1} style={[styles.edgeName, { color: palette.text }]}>
                {uid === null ? '' : otherName(edge, uid)}
              </Text>
              <Button
                size="compact"
                label="Accept"
                onPress={() => {
                  if (uid !== null) void acceptFriend(uid, shownName, edge);
                }}
              />
              <Button
                size="compact"
                variant="subtle"
                label="Decline"
                onPress={() => void removeFriend(edge)}
              />
            </View>
          ))}
        </View>
      )}

      <Field
        label="Add someone by their code"
        placeholder="ABCD-EFGH"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        value={entered}
        onChangeText={setEntered}
        onSubmitEditing={() => void send()}
        returnKeyType="send"
      />
      <View style={styles.start}>
        <Button
          size="compact"
          variant="subtle"
          label="Send request"
          busy={busy}
          disabled={entered === ''}
          onPress={() => void send()}
        />
      </View>

      {sent.length === 0 ? null : (
        <View style={styles.list}>
          <Heading>Waiting on them</Heading>
          {sent.map((edge) => (
            <EdgeRow key={edge.id} edge={edge} me={uid} label="Withdraw" />
          ))}
        </View>
      )}

      {connected.length === 0 ? (
        <Small>
          Nobody connected yet. Once someone is, the share panel on a workout can send straight to
          them.
        </Small>
      ) : (
        <View style={styles.list}>
          <Heading>Connected</Heading>
          {connected.map((edge) => (
            <EdgeRow key={edge.id} edge={edge} me={uid} label="Remove" />
          ))}
        </View>
      )}
    </Card>
  );
}

/** One connection, at whatever stage. The control is the only difference. */
function EdgeRow({ edge, me, label }: { edge: FriendEdge; me: string | null; label: string }) {
  const palette = usePalette();
  return (
    <View testID="friend-row" style={styles.edge}>
      <Text numberOfLines={1} style={[styles.edgeName, { color: palette.text }]}>
        {me === null ? '' : otherName(edge, me)}
      </Text>
      <Button
        size="compact"
        variant="danger-subtle"
        label={label}
        onPress={() => void removeFriend(edge)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  code: { gap: 8, alignItems: 'flex-start' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  codeText: { fontSize: 18, fontWeight: '700', letterSpacing: 1.5 },
  full: { alignSelf: 'stretch' },
  list: { gap: 8 },
  edge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  edgeName: { flex: 1, fontSize: 14 },
  start: { alignItems: 'flex-start' },
});
