import { Card, Stack, Text, Title } from '@mantine/core';
import { useAuth } from '@/data/hooks/useAuth';

export default function TodayScreen() {
  const { user } = useAuth();

  return (
    <Stack>
      <Title order={2}>Today</Title>
      <Card withBorder>
        <Stack gap="xs">
          <Text fw={600}>Signed in{user?.email === null ? '' : ` as ${user?.email ?? ''}`}</Text>
          <Text c="dimmed" size="sm">
            Starting a session lands here in phase 3. The foundation is in place: auth, offline
            Firestore, the unit preference, and the installable shell.
          </Text>
        </Stack>
      </Card>
    </Stack>
  );
}
