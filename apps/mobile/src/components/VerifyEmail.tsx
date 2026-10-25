import { useAuth } from '@lift/data/hooks/useAuth';
import { useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authMessage } from '../authErrors';
import { usePalette } from '../theme';
import { Body, Button, Card, Notice, Small, Title } from './ui';

/** Slow enough to be free, fast enough that a click feels like it just worked. */
const POLL_MS = 4000;

/**
 * The wall an unconfirmed password account meets: the web's
 * `VerifyEmailScreen`.
 *
 * The link is opened in a mail app or a browser, and nothing pushes the
 * result back here, so this asks: on a timer while it is open, again the
 * moment the app comes back to the front (which is how you return from the
 * mail app), and on demand from the button, which is the guarantee.
 */
export function VerifyEmail() {
  const palette = usePalette();
  const { user, sendVerification, refreshVerification, signOutUser, verificationSend } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Silent on failure: a background courtesy, and an error every four
    // seconds offline would be its own bug.
    const poll = (): void => {
      void refreshVerification().catch(() => false);
    };
    const timer = setInterval(poll, POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refreshVerification]);

  const sendFailed = verificationSend.state === 'failed';
  // Newest first: an error from this screen's own button is more recent than
  // the send that registration recorded.
  const problem =
    error ?? (verificationSend.state === 'failed' ? authMessage(verificationSend.cause) : null);

  const resend = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await sendVerification();
      setSent(true);
    } catch (cause) {
      setError(authMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const check = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // True unmounts this screen: the gate above it re-renders.
      await refreshVerification();
      setChecked(true);
    } catch (cause) {
      setError(authMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Title>Confirm your email</Title>
        <Body dimmed>We email a link, not a code. One tap and you are in.</Body>

        <Card>
          {sendFailed ? (
            <Body>
              We could not send the link to {user?.email ?? 'your address'}. Your account is made —
              tap Send it again to try once more.
            </Body>
          ) : (
            <>
              <Body>
                We sent a link to {user?.email ?? 'your address'}. Open it and this screen will let
                you through on its own.
              </Body>
              <Body dimmed>
                Check the spam folder if it is not there after a minute — confirmation mail from a
                new project often lands in it.
              </Body>
            </>
          )}

          {sent ? (
            <Notice tone="success">
              Sent again. The newest link is the one that works — older ones stop working when a new
              one is issued.
            </Notice>
          ) : null}
          {checked ? (
            <Notice tone="orange">
              Still not confirmed. If you just opened the link, give it a couple of seconds and
              check again.
            </Notice>
          ) : null}
          {problem === null ? null : <Notice tone="danger">{problem}</Notice>}

          <Button label="I have confirmed it" onPress={() => void check()} busy={busy} />
          <Button
            variant="subtle"
            label="Send it again"
            disabled={busy}
            onPress={() => void resend()}
          />
          <Button
            variant="subtle"
            size="compact"
            label="Sign out"
            disabled={busy}
            onPress={() => void signOutUser()}
          />
        </Card>

        <Small>
          Wrong address? Sign out and create the account again — nothing has been saved to it yet.
        </Small>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
});
