import { Card, Stack, Text, Title } from '@mantine/core';

export default function HistoryScreen() {
  return (
    <Stack>
      <Title order={2}>History</Title>
      <Card withBorder>
        <Text c="dimmed" size="sm">
          The session timeline and per-exercise history arrive in phase 4.
        </Text>
      </Card>
    </Stack>
  );
}
