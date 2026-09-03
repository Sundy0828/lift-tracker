import {
  Badge,
  Button,
  Card,
  Group,
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
import { setDisplayUnit } from '@/data/mutations/profile';
import { formatWeight, isUnit, stepFor } from '@/domain/units';

// A load stored in lb, so switching the display unit visibly converts it.
const SAMPLE = { value: 185, unit: 'lb' } as const;

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
