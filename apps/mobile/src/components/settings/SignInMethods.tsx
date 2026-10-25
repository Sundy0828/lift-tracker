import { useAuth } from '@lift/data/hooks/useAuth';
import {
  GOOGLE_PROVIDER,
  PASSWORD_PROVIDER,
  linkGoogle,
  linkPassword,
  unlinkProvider,
} from '@lift/data/mutations/account';
import { isAcceptable, SUMMARY } from '@lift/domain/password';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Sheet } from '../editor/controls';
import { PasswordRequirements } from '../PasswordRequirements';
import { Badge, Body, Button, Card, Field, Heading, Notice, Small } from '../ui';

/** Why a change failed, in terms of what to do about it. The web's wording. */
function describe(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Google cannot be linked from the app yet. Link it in Settings on the web; it then works here too.';
  }
  if (code === 'auth/credential-already-in-use') {
    return 'That Google account is already attached to a different Lift Tracker account. Sign in to that one instead, or unlink it there first.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'That address already has its own account, so it cannot also be a password for this one.';
  }
  if (code === 'auth/provider-already-linked') return 'That is already linked.';
  if (code === 'auth/weak-password') return `That password was refused. ${SUMMARY}`;
  if (code === 'auth/requires-recent-login') {
    return 'For safety this needs a fresh sign-in. Sign out, sign back in, and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'No connection, so nothing changed. Try again once you are back online.';
  }
  return cause instanceof Error ? cause.message : 'Something went wrong. Nothing changed.';
}

/**
 * The ways into this account: the web's `SignInMethods`.
 *
 * Linking adds another way into the same account, never a second account.
 * Google itself cannot be linked from the phone until it has a native Google
 * sign-in (MOBILE_PLAN, Phase 2), so that button says where to do it.
 */
export function SignInMethods() {
  const { user, providerIds, refreshUser } = useAuth();
  const hasGoogle = providerIds.includes(GOOGLE_PROVIDER);
  const hasPassword = providerIds.includes(PASSWORD_PROVIDER);
  const onlyOne = providerIds.length <= 1;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const run = async (action: () => Promise<void>, success: string): Promise<boolean> => {
    if (user === null) return false;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await action();
      await refreshUser();
      setDone(success);
      return true;
    } catch (cause) {
      setError(describe(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const closeAdd = (): void => {
    if (busy) return;
    setAdding(false);
    setPassword('');
    setConfirm('');
  };

  return (
    <Card>
      <Heading>Sign-in methods</Heading>
      <Body dimmed>
        Adding a second one does not create a second account — it is another way into this one, with
        all the same data behind it.
      </Body>

      {done === null ? null : (
        <Notice
          tone="success"
          onClose={() => {
            setDone(null);
          }}
        >
          {done}
        </Notice>
      )}
      {error === null || adding ? null : (
        <Notice tone="danger" title="Nothing changed">
          {error}
        </Notice>
      )}

      <View style={styles.method}>
        <View style={styles.grow}>
          <View style={styles.name}>
            <Body>Email and password</Body>
            <Badge tone={hasPassword ? 'success' : 'gray'} label={hasPassword ? 'on' : 'off'} />
          </View>
          <Small numberOfLines={1}>{user?.email ?? 'No address'}</Small>
        </View>
        {hasPassword ? (
          <Button
            size="compact"
            variant="danger-subtle"
            label="Remove"
            disabled={busy || onlyOne}
            onPress={() => {
              if (user !== null) {
                void run(
                  () => unlinkProvider(user, PASSWORD_PROVIDER, ''),
                  'Password removed. Google is now the only way in.',
                );
              }
            }}
          />
        ) : (
          <Button
            size="compact"
            variant="subtle"
            label="Add"
            disabled={busy}
            onPress={() => {
              setDone(null);
              setError(null);
              setAdding(true);
            }}
          />
        )}
      </View>

      <View style={styles.method}>
        <View style={styles.grow}>
          <View style={styles.name}>
            <Body>Google</Body>
            <Badge tone={hasGoogle ? 'success' : 'gray'} label={hasGoogle ? 'on' : 'off'} />
          </View>
          <Small>{hasGoogle ? 'One tap, no password to remember' : 'Not linked'}</Small>
        </View>
        {hasGoogle ? (
          <Button
            size="compact"
            variant="danger-subtle"
            label="Remove"
            disabled={busy || onlyOne}
            onPress={() => {
              if (user !== null) {
                void run(
                  () => unlinkProvider(user, GOOGLE_PROVIDER, ''),
                  'Google unlinked. Your email and password still work.',
                );
              }
            }}
          />
        ) : (
          <Button
            size="compact"
            variant="subtle"
            label="Link"
            disabled={busy}
            onPress={() => {
              if (user !== null) {
                void run(() => linkGoogle(user), 'Google linked. Either way in works from now on.');
              }
            }}
          />
        )}
      </View>

      {onlyOne ? (
        <Small>
          The last method cannot be removed — an account with no way in keeps its data and locks you
          out of it for good.
        </Small>
      ) : null}

      <Sheet visible={adding} title="Add a password" onClose={closeAdd}>
        <Body dimmed>
          You will be able to sign in with {user?.email ?? 'your address'} and this password, as
          well as with Google.
        </Body>
        <Field
          label="New password"
          description={SUMMARY}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!busy}
          value={password}
          onChangeText={setPassword}
        />
        <PasswordRequirements password={password} />
        <Field
          label="New password again"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!busy}
          value={confirm}
          onChangeText={setConfirm}
        />
        {confirm !== '' && confirm !== password ? <Small>These do not match.</Small> : null}
        {error === null ? null : <Notice tone="danger">{error}</Notice>}
        <Button
          label="Add password"
          busy={busy}
          disabled={!isAcceptable(password) || password !== confirm}
          onPress={() => {
            if (user === null) return;
            void run(
              () => linkPassword(user, password),
              'Password added. You can now sign in with either your email and password or Google.',
            ).then((ok) => {
              if (ok) {
                setAdding(false);
                setPassword('');
                setConfirm('');
              }
            });
          }}
        />
      </Sheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  method: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, gap: 2 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
