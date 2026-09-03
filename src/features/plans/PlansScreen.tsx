import { Button, Card, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';

export default function PlansScreen() {
  return (
    <Stack>
      <Title order={2}>Plans</Title>
      <Card withBorder>
        <Stack gap="sm">
          <Text c="dimmed" size="sm">
            Plan building, prescriptions, and the muscle map arrive in phase 2. The exercise library
            those plans draw from is ready now.
          </Text>
          <Button component={Link} to="/exercises" variant="light">
            Browse exercises
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
