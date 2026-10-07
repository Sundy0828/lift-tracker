import { useAuth } from '@lift/data/hooks/useAuth';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authMessage } from '../authErrors';
import { usePalette } from '../theme';
import { Body, Button, Title } from './ui';

/** Shown instead of the app until the address behind the sign-in is confirmed. */
export function VerifyEmail() {
  const palette = usePalette();
  const { user, sendVerification, refreshVerification, signOutUser } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (): Promise<void> => {
    setBusy(true);
    try {
      const verified = await refreshVerification();
      if (!verified) setMessage('Not confirmed yet. Open the link in the email, then try again.');
    } catch (cause) {
      setMessage(authMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const resend = async (): Promise<void> => {
    try {
      await sendVerification();
      setMessage('Sent another link.');
    } catch (cause) {
      setMessage(authMessage(cause));
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      <View style={styles.body}>
        <Title>Confirm your email</Title>
        <Body>
          We sent a link to {user?.email ?? 'your address'}. Open it, then come back here.
        </Body>
        {message === null ? null : <Body dimmed>{message}</Body>}
        <Button label="I have confirmed it" onPress={() => void check()} busy={busy} />
        <Button variant="subtle" label="Send the link again" onPress={() => void resend()} />
        <Button variant="subtle" label="Sign out" onPress={() => void signOutUser()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
});
