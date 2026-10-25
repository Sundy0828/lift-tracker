import { useAuth } from '@lift/data/hooks/useAuth';
import { isAcceptable, problem, SUMMARY } from '@lift/domain/password';
import { nameProblem } from '@lift/domain/person';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authMessage } from '../authErrors';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { Body, Button, Field, Notice, Small, Title } from '../components/ui';
import { returnPath } from '../links';
import { usePalette } from '../theme';

type Mode = 'sign-in' | 'register' | 'reset';

const TITLES: Record<Mode, string> = {
  'sign-in': 'Sign in',
  register: 'Create an account',
  reset: 'Reset your password',
};

const ACTIONS: Record<Mode, string> = {
  'sign-in': 'Sign in',
  register: 'Create account',
  reset: 'Send the reset link',
};

/**
 * Sign in, create an account, or reset a password: the web's `SignInScreen`,
 * email and password only for now. Google needs a native sign-in library and
 * an OAuth client per platform (MOBILE_PLAN, Phase 6). An account created with
 * Google on the web can still sign in here once it has a password (web
 * Settings > Sign-in methods).
 */
export default function SignIn() {
  const palette = usePalette();
  const { status, signInWithEmail, registerWithEmail, sendPasswordReset } = useAuth();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Back to the link that sent you here (a share, a friend code), if any.
  if (status === 'signed-in') return <Redirect href={returnPath(from)} />;

  const switchTo = (next: Mode): void => {
    setMode(next);
    setError(null);
    setResetSent(false);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setResetSent(false);
    if (mode === 'reset') {
      if (email.trim() === '') {
        setError('Enter the address you signed up with.');
        return;
      }
    } else if (mode === 'register' && !isAcceptable(password)) {
      // Only on the way in is a password judged: signing in must never
      // re-judge one that already works.
      setError(problem(password) ?? SUMMARY);
      return;
    }
    // Both names are required: the avatar and Settings are built on them.
    const missingName = mode === 'register' ? nameProblem(firstName, lastName) : null;
    if (missingName !== null) {
      setError(missingName);
      return;
    }
    setBusy(true);
    try {
      if (mode === 'sign-in') await signInWithEmail(email.trim(), password);
      else if (mode === 'register') {
        await registerWithEmail(email.trim(), password, { firstName, lastName });
      } else {
        await sendPasswordReset(email.trim());
        setResetSent(true);
      }
    } catch (cause) {
      setError(authMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Title>{TITLES[mode]}</Title>
          {mode === 'reset' ? (
            <Body dimmed>
              Enter the address you signed up with and we will send a link to set a new password.
            </Body>
          ) : null}
          {mode === 'register' ? (
            <View style={styles.names}>
              <View style={styles.grow}>
                <Field
                  testID="first-name"
                  label="First name"
                  autoCapitalize="words"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoComplete="given-name"
                  textContentType="givenName"
                />
              </View>
              <View style={styles.grow}>
                <Field
                  testID="last-name"
                  label="Last name"
                  autoCapitalize="words"
                  value={lastName}
                  onChangeText={setLastName}
                  autoComplete="family-name"
                  textContentType="familyName"
                />
              </View>
            </View>
          ) : null}
          <Field
            testID="email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          {mode === 'reset' ? null : (
            <Field
              testID="password"
              label="Password"
              // Stated only where it is being chosen.
              {...(mode === 'register' ? { description: SUMMARY } : {})}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
            />
          )}
          {mode === 'register' ? (
            <>
              <PasswordRequirements password={password} />
              <Small>
                We will email you a link to confirm the address before you can start logging.
              </Small>
            </>
          ) : null}
          {resetSent ? (
            <Notice tone="success">
              If that address has an account, a reset link is on its way. Check the spam folder if
              it has not arrived in a minute.
            </Notice>
          ) : null}
          {error === null ? null : <Notice tone="danger">{error}</Notice>}
          <Button
            label={ACTIONS[mode]}
            onPress={() => void submit()}
            busy={busy}
            disabled={
              mode === 'register' &&
              (!isAcceptable(password) || nameProblem(firstName, lastName) !== null)
            }
          />
          <View style={styles.links}>
            {mode === 'sign-in' ? (
              <>
                <Button
                  variant="subtle"
                  label="New here? Create an account"
                  onPress={() => {
                    switchTo('register');
                  }}
                />
                <Button
                  variant="subtle"
                  label="Forgot password"
                  onPress={() => {
                    switchTo('reset');
                  }}
                />
              </>
            ) : (
              <Button
                variant="subtle"
                label={mode === 'register' ? 'Have an account? Sign in' : 'Back to sign in'}
                onPress={() => {
                  switchTo('sign-in');
                }}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  links: { gap: 8 },
  names: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
});
