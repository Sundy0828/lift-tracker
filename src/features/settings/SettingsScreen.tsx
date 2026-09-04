import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useNavigate } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useProfile } from '@/data/hooks/useProfile';
import { setDefaultRestSeconds, setDisplayUnit } from '@/data/mutations/profile';
import { formatRestSeconds } from '@/domain/plans';
import { formatWeight, isUnit, stepFor } from '@/domain/units';

// A load stored in lb, so switching the display unit visibly converts it.
const SAMPLE = { value: 185, unit: 'lb' } as const;

const REST_PRESETS = [60, 90, 120, 180, 240];

export default function SettingsScreen() {
  const { user, signOutUser } = useAuth();
  const { profile, isPending, hasPendingWrites } = useProfile();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const navigate = useNavigate();

  const uid = user?.uid ?? null;

  const changeUnit = (value: string): void => {
    if (uid === null || !isUnit(value)) return;
    // Not awaited: Firestore applies it to the local cache and the listener
    // above re-renders immediately, online or off.
    void setDisplayUnit(uid, value);
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
            </>
          )}
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

      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Account</Text>
          <Text size="sm" c="dimmed">
            {user?.email ?? user?.displayName ?? 'Signed in'}
          </Text>
          <Button
            variant="light"
            color="red"
            onClick={() => {
              void signOutUser().then(() => navigate('/sign-in', { replace: true }));
            }}
          >
            Sign out
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}

function asColorScheme(value: string): 'auto' | 'light' | 'dark' {
  return value === 'light' || value === 'dark' ? value : 'auto';
}
