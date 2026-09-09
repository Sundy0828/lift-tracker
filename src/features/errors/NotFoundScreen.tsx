import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { Link, useLocation } from 'react-router';

/**
 * A real 404.
 *
 * The catch-all route used to render Today, which quietly lied: a mistyped or
 * stale link looked like it had worked and left you wondering why your session
 * was not there. Saying "this address does not exist" costs one screen and
 * removes a whole class of confusion.
 */
export default function NotFoundScreen() {
  const location = useLocation();

  return (
    <Stack>
      <Title order={2}>Page not found</Title>
      <Card withBorder>
        <Stack gap="sm" align="flex-start">
          <Text size="sm">
            Nothing lives at{' '}
            <Text span ff="monospace">
              {location.pathname}
            </Text>
            .
          </Text>
          <Text size="sm" c="dimmed">
            A workout or session that was deleted will do this, and so will an old link from before
            something was renamed. Your data is untouched either way.
          </Text>
          <Group gap="xs">
            <Button component={Link} to="/">
              Go to Today
            </Button>
            <Button component={Link} to="/history" variant="default">
              Open History
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
