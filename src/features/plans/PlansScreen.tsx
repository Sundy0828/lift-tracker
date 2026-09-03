import { Card, Stack, Text, Title } from '@mantine/core';

export default function PlansScreen() {
  return (
    <Stack>
      <Title order={2}>Plans</Title>
      <Card withBorder>
        <Text c="dimmed" size="sm">
          Plan building, prescriptions, and the muscle map arrive in phase 2.
        </Text>
      </Card>
    </Stack>
  );
}
