import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  Modal,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useProfile } from '@/data/hooks/useProfile';
import {
  changePassword,
  deleteAccount,
  deleteAllData,
  reauthMethod,
} from '@/data/mutations/account';
import {
  setAutoStartRest,
  setDefaultRestSeconds,
  setDisplayUnit,
  setHandedness,
} from '@/data/mutations/profile';
import { isHandedness } from '@/domain/types';
import { formatRestSeconds } from '@/domain/workouts';
import { formatWeight, isUnit, stepFor } from '@/domain/units';
import { PasswordRequirements } from '@/features/auth/PasswordRequirements';
import { isAcceptable, problem as passwordProblem, SUMMARY } from '@/features/auth/password';
import { SignInMethods } from './SignInMethods';
import { SyncCard } from './SyncCard';

// A load stored in lb, so switching the display unit visibly converts it.
const SAMPLE = { value: 185, unit: 'lb' } as const;

/**
 * Typed in full to confirm a delete.
 *
 * A second button would be one mis-tap from destroying an account. Making the
 * confirmation something you have to *compose* is the only interaction that
 * cannot be reached by tapping where the previous button was.
 */
const CONFIRM_PHRASE = 'DELETE';

/**
 * The two destructive paths. They share a confirmation but not a blast radius,
 * so they share a modal too — which keeps the wording about *which* one is
 * about to run next to the button that runs it.
 */
type DestructiveAction = 'data' | 'account';

const REST_PRESETS = [60, 90, 120, 180, 240];

export default function SettingsScreen() {
  const { user, signOutUser } = useAuth();
  const { profile, isPending, hasPendingWrites } = useProfile();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const navigate = useNavigate();

  const uid = user?.uid ?? null;

  const [pending, setPending] = useState<DestructiveAction | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Only an account delete touches the login, so only it has to re-prove the
  // sign-in. Wiping data needs no reauthentication — Firestore has no recency
  // rule, and pretending otherwise would just train people to retype a
  // password for something that never needed one.
  const signInMethod = user === null ? 'unsupported' : reauthMethod(user);
  const method = pending === 'account' ? signInMethod : 'unsupported';
  const needsPassword = method === 'password';

  const closePending = (): void => {
    // Never while it is in flight: closing would not cancel it, and after an
    // account delete the screen behind it is about to stop existing.
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
        // The auth listener fires on its own, but navigating explicitly avoids
        // a frame of the signed-in shell rendering against data that is gone.
        await navigate('/sign-in', { replace: true });
        return;
      }

      await deleteAllData(user.uid);
      setBusy(false);
      setPending(null);
      setConfirmation('');
      // Said out loud rather than left to an empty History screen, which
      // looks the same whether it worked or silently did nothing.
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
      closePasswordChangeAfterSuccess();
    } catch (cause) {
      setPasswordBusy(false);
      setPasswordError(describePasswordError(cause));
    }
  };

  const closePasswordChangeAfterSuccess = (): void => {
    setChangingPassword(false);
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setDone('Password changed. The next sign-in will use the new one.');
  };

  const changeUnit = (value: string): void => {
    if (uid === null || !isUnit(value)) return;
    // Not awaited: Firestore applies it to the local cache and the listener
    // above re-renders immediately, online or off.
    void setDisplayUnit(uid, value);
  };

  const changeHandedness = (value: string): void => {
    if (uid === null || !isHandedness(value)) return;
    void setHandedness(uid, value);
  };

  return (
    <Stack>
      <Title order={2}>Settings</Title>

      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={600}>Units</Text>
            {hasPendingWrites ? (
              <Badge variant="light" color="gray" size="sm">
                saved locally · will sync
              </Badge>
            ) : null}
          </Group>

          {isPending ? (
            <Skeleton height={42} radius="md" />
          ) : (
            <SegmentedControl
              fullWidth
              value={profile.displayUnit}
              onChange={changeUnit}
              data={[
                { value: 'lb', label: 'Pounds (lb)' },
                { value: 'kg', label: 'Kilograms (kg)' },
              ]}
              aria-label="Display unit"
            />
          )}

          <Text size="sm" c="dimmed">
            Weights are stored exactly as you enter them, so switching this never rewrites your
            history. A set logged as {formatWeight(SAMPLE, 'lb')} shows as{' '}
            {formatWeight(SAMPLE, profile.displayUnit)} and steppers move in{' '}
            {stepFor(profile.displayUnit)} {profile.displayUnit}.
          </Text>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={600}>Default rest</Text>
            {isPending ? null : (
              <Text size="sm" c="dimmed">
                {formatRestSeconds(profile.defaultRestSeconds)}
              </Text>
            )}
          </Group>

          <Text size="sm" c="dimmed">
            Used by the rest timer for any exercise that has no rest of its own, and shown as the
            fallback when you edit a prescription.
          </Text>

          {isPending ? (
            <Skeleton height={42} radius="md" />
          ) : (
            <>
              <Group gap="xs">
                {REST_PRESETS.map((seconds) => (
                  <Button
                    key={seconds}
                    size="compact-sm"
                    variant={profile.defaultRestSeconds === seconds ? 'filled' : 'default'}
                    onClick={() => {
                      if (uid !== null) void setDefaultRestSeconds(uid, seconds);
                    }}
                  >
                    {formatRestSeconds(seconds)}
                  </Button>
                ))}
              </Group>
              <NumberInput
                aria-label="Default rest seconds"
                suffix="s"
                min={15}
                max={3600}
                step={15}
                clampBehavior="blur"
                allowDecimal={false}
                value={profile.defaultRestSeconds}
                onChange={(value) => {
                  if (uid !== null && typeof value === 'number' && value >= 15) {
                    void setDefaultRestSeconds(uid, value);
                  }
                }}
              />
              <Switch
                label="Start the rest timer on its own"
                description="Starts once a set holds its weight, reps and effort, or when you tick it. Off: the rest bar offers a Start rest button instead."
                checked={profile.autoStartRest}
                onChange={(event) => {
                  if (uid !== null) void setAutoStartRest(uid, event.currentTarget.checked);
                }}
              />
            </>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Handedness</Text>

          <Text size="sm" c="dimmed">
            Puts the How to and Note buttons on the side your thumb reaches while you log a set.
          </Text>

          {isPending ? (
            <Skeleton height={42} radius="md" />
          ) : (
            <SegmentedControl
              fullWidth
              value={profile.handedness}
              onChange={changeHandedness}
              data={[
                { value: 'right', label: 'Right handed' },
                { value: 'left', label: 'Left handed' },
              ]}
              aria-label="Handedness"
            />
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Exercises</Text>
          <Text size="sm" c="dimmed">
            Browse the catalog and manage your custom exercises.
          </Text>
          <Button component={Link} to="/exercises" variant="default">
            Exercise library
          </Button>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Appearance</Text>
          <SegmentedControl
            fullWidth
            value={colorScheme}
            onChange={(value) => {
              setColorScheme(asColorScheme(value));
            }}
            data={[
              { value: 'auto', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            aria-label="Color scheme"
          />
        </Stack>
      </Card>

      <SyncCard />

      <SignInMethods />

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Account</Text>
          <Text size="sm" c="dimmed">
            {user?.email ?? user?.displayName ?? 'Signed in'}
          </Text>
          {signInMethod === 'password' ? (
            <Button
              variant="default"
              onClick={() => {
                setDone(null);
                setChangingPassword(true);
              }}
            >
              Change password
            </Button>
          ) : (
            <Text size="xs" c="dimmed">
              Signed in with Google, so there is no password here to change — Google holds it.
            </Text>
          )}
          <Button
            variant="light"
            onClick={() => {
              void signOutUser().then(() => navigate('/sign-in', { replace: true }));
            }}
          >
            Sign out
          </Button>
        </Stack>
      </Card>

      <Card withBorder style={{ borderColor: 'var(--mantine-color-red-5)' }}>
        <Stack gap="sm">
          <Text fw={600} c="red">
            Danger zone
          </Text>

          {done === null ? null : (
            <Alert
              variant="light"
              color="green"
              withCloseButton
              onClose={() => {
                setDone(null);
              }}
            >
              <Text size="sm">{done}</Text>
            </Alert>
          )}

          <Text size="sm" c="dimmed">
            Both of these erase the same training data. Neither can be undone, and there is no
            export, no soft delete and no recovery window.
          </Text>
          <List size="sm" c="dimmed" spacing={2}>
            <List.Item>Every workout and every published version of it</List.Item>
            <List.Item>Every logged session, including sets, notes and bodyweight</List.Item>
            <List.Item>Every personal record and all overlay history</List.Item>
            <List.Item>Your custom exercises</List.Item>
          </List>

          <Text size="sm" c="dimmed">
            <Text span fw={600}>
              Delete all data
            </Text>{' '}
            stops there: you stay signed in, your settings go back to their defaults, and the
            account is the clean slate a new one would be.{' '}
            <Text span fw={600}>
              Delete account
            </Text>{' '}
            also removes the login, after which there is nothing left to sign in with.
          </Text>

          <Group gap="xs">
            <Button
              variant="light"
              color="red"
              onClick={() => {
                setDone(null);
                setPending('data');
              }}
            >
              Delete all data
            </Button>
            <Button
              variant="filled"
              color="red"
              onClick={() => {
                setDone(null);
                setPending('account');
              }}
            >
              Delete account
            </Button>
          </Group>
        </Stack>
      </Card>

      <Modal
        opened={changingPassword}
        onClose={closePasswordChange}
        title="Change password"
        closeOnClickOutside={!passwordBusy}
        closeOnEscape={!passwordBusy}
        withCloseButton={!passwordBusy}
      >
        <Stack>
          <PasswordInput
            label="Current password"
            data-autofocus
            autoComplete="current-password"
            value={currentPassword}
            disabled={passwordBusy}
            onChange={(event) => {
              setCurrentPassword(event.currentTarget.value);
            }}
          />
          <PasswordInput
            label="New password"
            description={SUMMARY}
            autoComplete="new-password"
            value={nextPassword}
            disabled={passwordBusy}
            onChange={(event) => {
              setNextPassword(event.currentTarget.value);
            }}
          />
          <PasswordRequirements password={nextPassword} />
          <PasswordInput
            label="New password again"
            autoComplete="new-password"
            value={confirmPassword}
            disabled={passwordBusy}
            error={
              confirmPassword !== '' && confirmPassword !== nextPassword
                ? 'These do not match.'
                : null
            }
            onChange={(event) => {
              setConfirmPassword(event.currentTarget.value);
            }}
          />

          {passwordError === null ? null : (
            <Alert variant="light" color="red" title="Password not changed">
              <Text size="sm">{passwordError}</Text>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={closePasswordChange} disabled={passwordBusy}>
              Cancel
            </Button>
            <Button
              loading={passwordBusy}
              disabled={
                currentPassword === '' ||
                !isAcceptable(nextPassword) ||
                nextPassword !== confirmPassword
              }
              onClick={() => {
                void runPasswordChange();
              }}
            >
              Change password
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={pending !== null}
        onClose={closePending}
        title={pending === 'account' ? 'Delete account' : 'Delete all data'}
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        withCloseButton={!busy}
      >
        <Stack>
          <Alert variant="light" color="red">
            <Text size="sm">
              {pending === 'account'
                ? 'This deletes all of your data and your login, permanently. It cannot be undone.'
                : 'This deletes every workout, session and record on this account, permanently. You stay signed in and your settings go back to their defaults. It cannot be undone.'}
            </Text>
          </Alert>

          <TextInput
            label={`Type ${CONFIRM_PHRASE} to confirm`}
            placeholder={CONFIRM_PHRASE}
            value={confirmation}
            data-autofocus
            autoComplete="off"
            disabled={busy}
            onChange={(event) => {
              setConfirmation(event.currentTarget.value);
            }}
          />

          {needsPassword ? (
            <PasswordInput
              label="Your password"
              description="Firebase requires a recent sign-in before it will delete an account."
              value={password}
              disabled={busy}
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.currentTarget.value);
              }}
            />
          ) : method === 'google' ? (
            <Text size="sm" c="dimmed">
              A Google sign-in window will open first, to confirm it is really you. Nothing is
              deleted until it succeeds.
            </Text>
          ) : null}

          {error === null ? null : (
            <Alert variant="light" color="red" title="Nothing was deleted">
              <Text size="sm">{error}</Text>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={closePending} disabled={busy}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={busy}
              disabled={confirmation !== CONFIRM_PHRASE || (needsPassword && password === '')}
              onClick={() => {
                void runPending();
              }}
            >
              {pending === 'account' ? 'Delete everything' : 'Delete all data'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function asColorScheme(value: string): 'auto' | 'light' | 'dark' {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

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
 * Why a delete failed, in terms of what the user should do next.
 *
 * Every one of these leaves the account intact — reauthentication happens
 * before anything is destroyed — so the message says so plainly rather than
 * leaving someone wondering how much of their history just went.
 */
function describeDeleteError(cause: unknown): string {
  const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : null;

  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'That password was not right. Nothing has been deleted.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'The sign-in window closed before it could confirm you. Nothing has been deleted.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (code === 'unavailable' || code === 'firestore/unavailable') {
    return 'Could not reach the server. Deleting an account needs a connection, so nothing was changed.';
  }
  return cause instanceof Error ? cause.message : 'Something went wrong. Nothing has been deleted.';
}
