import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import {
  changePassword,
  deleteAccount,
  deleteAllData,
  reauthMethod,
} from '@lift/data/mutations/account';
import {
  setAutoStartRest,
  setDefaultRestSeconds,
  setDisplayUnit,
  setHandedness,
  setRestChime,
} from '@lift/data/mutations/profile';
import { isAcceptable, problem as passwordProblem, SUMMARY } from '@lift/domain/password';
import type { Handedness, Unit } from '@lift/domain/types';
import { formatWeight, stepFor } from '@lift/domain/units';
import { formatRestSeconds } from '@lift/domain/workouts';
import { type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, Sheet, Stepper } from '../../../components/editor/controls';
import { PasswordRequirements } from '../../../components/PasswordRequirements';
import { Screen } from '../../../components/Screen';
import { AppearanceCard } from '../../../components/settings/AppearanceCard';
import { ExportCard } from '../../../components/settings/ExportCard';
import { NameCard } from '../../../components/settings/NameCard';
import { SignInMethods } from '../../../components/settings/SignInMethods';
import { SyncCard } from '../../../components/settings/SyncCard';
import { ShareLinksCard } from '../../../components/sharing/ShareInventory';
import { Tour } from '../../../components/Tour';
import {
  Badge,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Row,
  Segmented,
  Small,
  SwitchRow,
  Title,
} from '../../../components/ui';
import { usePalette } from '../../../theme';
import { usePush } from '../../../navigation';

// A load stored in lb, so switching the display unit visibly converts it.
const SAMPLE = { value: 185, unit: 'lb' } as const;

/**
 * Typed in full to confirm a delete. A second button is one mis-tap from
 * destroying an account; a word you have to compose is not.
 */
const CONFIRM_PHRASE = 'DELETE';

/** The two destructive paths: same confirmation, different blast radius. */
type DestructiveAction = 'data' | 'account';

const REST_PRESETS = [60, 90, 120, 180, 240];
const REST_STEP = 15;
const REST_MIN = 15;
const REST_MAX = 3600;

/** Why a password change failed, in terms of what to do about it. */
function describePasswordError(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'That current password was not right.';
  }
  if (code === 'auth/weak-password') return `That new password was refused. ${SUMMARY}`;
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a minute and try again.';
  if (code === 'auth/network-request-failed') {
    return 'No connection, so nothing changed. Try again once you are back online.';
  }
  return cause instanceof Error ? cause.message : 'Something went wrong. Nothing changed.';
}

/**
 * Why a delete failed. Every one of these leaves the account intact:
 * reauthentication happens before anything is destroyed.
 */
function describeDeleteError(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'That password was not right. Nothing has been deleted.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'This account signs in with Google, which the app cannot confirm yet. Delete it from Settings on the web. Nothing has been deleted.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a minute and try again.';
  if (code === 'unavailable' || code === 'firestore/unavailable') {
    return 'Could not reach the server. Deleting an account needs a connection, so nothing was changed.';
  }
  return cause instanceof Error ? cause.message : 'Something went wrong. Nothing has been deleted.';
}

/** A card that leads to another screen. */
function LinkCard({
  title,
  body,
  links,
}: {
  title: string;
  body: string;
  links: readonly { label: string; href: Href }[];
}) {
  const push = usePush();
  return (
    <Card>
      <Heading>{title}</Heading>
      <Body dimmed>{body}</Body>
      {links.map((link) => (
        <Button
          key={link.label}
          variant="subtle"
          label={link.label}
          onPress={() => {
            push(link.href);
          }}
        />
      ))}
    </Card>
  );
}

/**
 * Settings: the web's `SettingsScreen`, card for card. Every profile setting
 * writes through to the local cache and syncs; appearance stays on this
 * phone.
 */
export default function Settings() {
  const palette = usePalette();
  const { user, signOutUser } = useAuth();
  const { profile, isPending, hasPendingWrites } = useProfile();
  const uid = user?.uid ?? null;

  const [pending, setPending] = useState<DestructiveAction | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);

  // Only an account delete touches the login, so only it re-proves the sign-in.
  const signInMethod = user === null ? 'unsupported' : reauthMethod(user);
  const needsPassword = pending === 'account' && signInMethod === 'password';

  const closePending = (): void => {
    // Never mid-flight: closing would not cancel it.
    if (busy) return;
    setPending(null);
    setConfirmation('');
    setPassword('');
    setError(null);
  };

  const runPending = async (): Promise<void> => {
    if (user === null || confirmation !== CONFIRM_PHRASE) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === 'account') {
        await deleteAccount(user, password);
        // The auth listener sends the app to sign-in on its own.
        return;
      }
      await deleteAllData(user.uid);
      setBusy(false);
      setPending(null);
      setConfirmation('');
      // Said out loud: an empty History looks the same whether it worked or not.
      setDone('All training data deleted. The account is back to a clean slate.');
    } catch (cause) {
      setBusy(false);
      setError(describeDeleteError(cause));
    }
  };

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const closePasswordChange = (): void => {
    if (passwordBusy) return;
    setChangingPassword(false);
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
    setPasswordError(null);
  };

  const runPasswordChange = async (): Promise<void> => {
    if (user === null) return;
    if (nextPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }
    const rejected = passwordProblem(nextPassword);
    if (rejected !== null) {
      setPasswordError(rejected);
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await changePassword(user, currentPassword, nextPassword);
      setPasswordBusy(false);
      setChangingPassword(false);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      setDone('Password changed. The next sign-in will use the new one.');
    } catch (cause) {
      setPasswordBusy(false);
      setPasswordError(describePasswordError(cause));
    }
  };

  const setRest = (seconds: number): void => {
    if (uid !== null) void setDefaultRestSeconds(uid, seconds);
  };

  return (
    <Screen>
      <Title>Settings</Title>

      <NameCard />

      <Card>
        <View style={styles.head}>
          <Heading>Units</Heading>
          {hasPendingWrites ? <Badge label="saved locally · will sync" /> : null}
        </View>
        {isPending ? null : (
          <Segmented<Unit>
            label="Display unit"
            options={[
              { value: 'lb', label: 'Pounds (lb)' },
              { value: 'kg', label: 'Kilograms (kg)' },
            ]}
            value={profile.displayUnit}
            onChange={(unit) => {
              // Not awaited: the local cache has it at once, online or off.
              if (uid !== null) void setDisplayUnit(uid, unit);
            }}
          />
        )}
        <Body dimmed>
          Weights are stored exactly as you enter them, so switching this never rewrites your
          history. A set logged as {formatWeight(SAMPLE, 'lb')} shows as{' '}
          {formatWeight(SAMPLE, profile.displayUnit)} and steppers move in{' '}
          {stepFor(profile.displayUnit)} {profile.displayUnit}.
        </Body>
      </Card>

      <Card>
        <View style={styles.head}>
          <Heading>Default rest</Heading>
          {isPending ? null : <Small>{formatRestSeconds(profile.defaultRestSeconds)}</Small>}
        </View>
        <Body dimmed>
          Used by the rest timer for any exercise that has no rest of its own, and shown as the
          fallback when you edit a prescription.
        </Body>
        {isPending ? null : (
          <>
            <Row gap={8}>
              {REST_PRESETS.map((seconds) => (
                <Chip
                  key={seconds}
                  label={formatRestSeconds(seconds)}
                  selected={profile.defaultRestSeconds === seconds}
                  onPress={() => {
                    setRest(seconds);
                  }}
                />
              ))}
            </Row>
            <Stepper
              label="Default rest"
              value={formatRestSeconds(profile.defaultRestSeconds)}
              canDecrement={profile.defaultRestSeconds > REST_MIN}
              canIncrement={profile.defaultRestSeconds < REST_MAX}
              onDecrement={() => {
                setRest(Math.max(REST_MIN, profile.defaultRestSeconds - REST_STEP));
              }}
              onIncrement={() => {
                setRest(Math.min(REST_MAX, profile.defaultRestSeconds + REST_STEP));
              }}
            />
            <SwitchRow
              label="Start the rest timer on its own"
              description="Starts once a set holds its weight, reps and effort, or when you tick it. Off: the rest bar offers a Start rest button instead."
              value={profile.autoStartRest}
              onChange={(value) => {
                if (uid !== null) void setAutoStartRest(uid, value);
              }}
            />
            <SwitchRow
              label="Sound when a rest ends"
              description="A short tone as well as the buzz, for a phone face-up on a bench. The notification covers a dark screen either way."
              value={profile.restChime}
              onChange={(value) => {
                if (uid !== null) void setRestChime(uid, value);
              }}
            />
          </>
        )}
      </Card>

      <Card>
        <Heading>Handedness</Heading>
        <Body dimmed>
          Puts the How to and Note buttons on the side your thumb reaches while you log a set.
        </Body>
        {isPending ? null : (
          <Segmented<Handedness>
            label="Handedness"
            options={[
              { value: 'right', label: 'Right handed' },
              { value: 'left', label: 'Left handed' },
            ]}
            value={profile.handedness}
            onChange={(value) => {
              if (uid !== null) void setHandedness(uid, value);
            }}
          />
        )}
      </Card>

      <Card>
        <Heading>How this works</Heading>
        <Body dimmed>
          The walkthrough from your first run, including the few things on a set row that have no
          button.
        </Body>
        <Button
          variant="subtle"
          label="Show the walkthrough"
          onPress={() => {
            setShowTour(true);
          }}
        />
      </Card>

      <LinkCard
        title="Exercises"
        body="Browse the catalog and manage your custom exercises."
        links={[
          { label: 'Exercise library', href: '/exercises' },
          { label: 'Workout library', href: '/library' },
        ]}
      />

      <AppearanceCard />

      <LinkCard
        title="Your week"
        body="Put workouts on weekdays and Today offers those first. Nothing counts a day you skip."
        links={[{ label: 'Weekly plan', href: '/schedule' }]}
      />

      <LinkCard
        title="Friends"
        body="Your code and QR, who has asked to connect, and who you can send a workout to."
        links={[{ label: 'Friends', href: '/friends' }]}
      />

      <ShareLinksCard />

      <ExportCard />

      <SyncCard />

      <SignInMethods />

      <Card>
        <Heading>Account</Heading>
        <Body dimmed>{user?.email ?? user?.displayName ?? 'Signed in'}</Body>
        {signInMethod === 'password' ? (
          <Button
            variant="subtle"
            label="Change password"
            onPress={() => {
              setDone(null);
              setChangingPassword(true);
            }}
          />
        ) : (
          <Small>
            Signed in with Google, so there is no password here to change — Google holds it.
          </Small>
        )}
        <Button variant="subtle" label="Sign out" onPress={() => void signOutUser()} />
      </Card>

      <View style={[styles.danger, { borderColor: palette.danger }]}>
        <Text style={[styles.dangerTitle, { color: palette.danger }]}>Danger zone</Text>
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
        <Body dimmed>
          Both of these erase the same training data. Neither can be undone, and there is no soft
          delete and no recovery window: every workout and its versions, every logged session, every
          record and all overlay history, and your custom exercises.
        </Body>
        <Body dimmed>
          Delete all data stops there: you stay signed in, your settings go back to their defaults,
          and the account is the clean slate a new one would be. Delete account also removes the
          login, after which there is nothing left to sign in with.
        </Body>
        <Row gap={8}>
          <Button
            size="compact"
            variant="danger-subtle"
            label="Delete all data"
            onPress={() => {
              setDone(null);
              setPending('data');
            }}
          />
          <Button
            size="compact"
            variant="danger"
            label="Delete account"
            onPress={() => {
              setDone(null);
              setPending('account');
            }}
          />
        </Row>
      </View>

      <Tour
        visible={showTour}
        onClose={() => {
          setShowTour(false);
        }}
      />

      <Sheet visible={changingPassword} title="Change password" onClose={closePasswordChange}>
        <Field
          label="Current password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          editable={!passwordBusy}
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <Field
          label="New password"
          description={SUMMARY}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!passwordBusy}
          value={nextPassword}
          onChangeText={setNextPassword}
        />
        <PasswordRequirements password={nextPassword} />
        <Field
          label="New password again"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!passwordBusy}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {confirmPassword !== '' && confirmPassword !== nextPassword ? (
          <Small>These do not match.</Small>
        ) : null}
        {passwordError === null ? null : (
          <Notice tone="danger" title="Password not changed">
            {passwordError}
          </Notice>
        )}
        <Button
          label="Change password"
          busy={passwordBusy}
          disabled={
            currentPassword === '' ||
            !isAcceptable(nextPassword) ||
            nextPassword !== confirmPassword
          }
          onPress={() => void runPasswordChange()}
        />
      </Sheet>

      <Sheet
        visible={pending !== null}
        title={pending === 'account' ? 'Delete account' : 'Delete all data'}
        onClose={closePending}
      >
        <Notice tone="danger">
          {pending === 'account'
            ? 'This deletes all of your data and your login, permanently. It cannot be undone.'
            : 'This deletes every workout, session and record on this account, permanently. You stay signed in and your settings go back to their defaults. It cannot be undone.'}
        </Notice>
        <Field
          label={`Type ${CONFIRM_PHRASE} to confirm`}
          placeholder={CONFIRM_PHRASE}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
          value={confirmation}
          onChangeText={setConfirmation}
        />
        {needsPassword ? (
          <Field
            label="Your password"
            description="Firebase requires a recent sign-in before it will delete an account."
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
            value={password}
            onChangeText={setPassword}
          />
        ) : null}
        {error === null ? null : (
          <Notice tone="danger" title="Nothing was deleted">
            {error}
          </Notice>
        )}
        <Button
          variant="danger"
          label={pending === 'account' ? 'Delete everything' : 'Delete all data'}
          busy={busy}
          disabled={confirmation !== CONFIRM_PHRASE || (needsPassword && password === '')}
          onPress={() => void runPending()}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  danger: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  dangerTitle: { fontSize: 15, fontWeight: '600' },
});
