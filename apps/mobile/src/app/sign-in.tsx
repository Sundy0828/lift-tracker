import { useAuth } from '@lift/data/hooks/useAuth';
import { isAcceptable, problem, SUMMARY } from '@lift/domain/password';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authMessage } from '../authErrors';
import { Body, Button, Field, Title } from '../components/ui';
import { usePalette } from '../theme';

type Mode = 'sign-in' | 'register';

/**
 * Email and password only for now. Google needs a native sign-in library and
 * an OAuth client per platform (MOBILE_PLAN, Phase 2). An account created with
 * Google on the web can still sign in here once it has a password (web
 * Settings > Sign-in methods).
 */
export default function SignIn() {
  const palette = usePalette();
  const { status, signInWithEmail, registerWithEmail, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (status === 'signed-in') return <Redirect href="/" />;

  const submit = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    if (mode === 'register' && !isAcceptable(password)) {
      setError(problem(password) ?? SUMMARY);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'sign-in') await signInWithEmail(email.trim(), password);
      else await registerWithEmail(email.trim(), password);
    } catch (cause) {
      setError(authMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    setError(null);
    if (email.trim() === '') {
      setError('Enter your email first.');
      return;
    }
    try {
      await sendPasswordReset(email.trim());
      setNotice('If that address has an account, a reset link is on its way.');
    } catch (cause) {
      setError(authMessage(cause));
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.form}
      >
        <Title>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</Title>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
        />
        {mode === 'register' ? <Body dimmed>{SUMMARY}</Body> : null}
        {error === null ? null : <Body>{error}</Body>}
        {notice === null ? null : <Body dimmed>{notice}</Body>}
        <Button
          label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
          onPress={() => void submit()}
          busy={busy}
        />
        <View style={styles.links}>
          <Button
            variant="subtle"
            label={mode === 'sign-in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            onPress={() => {
              setMode(mode === 'sign-in' ? 'register' : 'sign-in');
              setError(null);
            }}
          />
          {mode === 'sign-in' ? (
            <Button variant="subtle" label="Forgot password" onPress={() => void reset()} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  links: { gap: 8 },
});
