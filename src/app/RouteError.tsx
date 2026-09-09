import { Alert, Button, Card, Code, Group, Stack, Text, Title } from '@mantine/core';
import { Link, isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { useOnline } from './useOnline';

/**
 * What the user sees when a route fails.
 *
 * Three failures reach here and they want three different answers, so the
 * screen works out which one it is rather than showing one apology with a
 * stack trace under it:
 *
 * - **A screen would not download.** Every feature area is a lazy chunk (§3),
 *   so a missing chunk is either no network or a deploy that replaced the file
 *   this tab was still expecting. Both are fixed by reloading, and neither is
 *   the user's fault.
 * - **A 404 thrown as a response.** Nothing is broken; the address is wrong.
 * - **Anything else.** A real bug, and the only case where the message is
 *   worth showing.
 *
 * In all three the first thing said is that logged sets are safe, because that
 * is the actual question behind the fright — writes land in the local cache
 * before anything renders (§2.8), so an error here has never lost a set.
 */

/** Every bundler words this differently; all of them mean the same thing. */
const CHUNK_FAILURE =
  /dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch/i;

function isChunkFailure(error: unknown): boolean {
  return error instanceof Error && CHUNK_FAILURE.test(error.message);
}

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${String(error.status)} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const online = useOnline();

  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const chunk = isChunkFailure(error);

  const reload = (): void => {
    window.location.reload();
  };

  if (notFound) {
    return (
      <Stack maw={520} mx="auto" py="xl" px="md">
        <Title order={2}>Page not found</Title>
        <Text c="dimmed" size="sm">
          That address does not exist. It may have pointed at a workout or session that has since
          been deleted.
        </Text>
        <Group gap="xs">
          <Button component={Link} to="/">
            Go to Today
          </Button>
        </Group>
      </Stack>
    );
  }

  if (chunk) {
    return (
      <Stack maw={520} mx="auto" py="xl" px="md">
        <Title order={2}>{online ? 'That screen didn’t load' : 'You’re offline'}</Title>
        <Card withBorder>
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              {online
                ? 'The app was updated while this tab was open, so the screen it went looking for is no longer the one on the server. Reloading picks up the new version.'
                : 'This screen had not been downloaded yet, and there is no connection to fetch it with. Screens you have already opened still work offline.'}
            </Text>
            <Text size="sm" c="dimmed">
              Nothing you logged has been lost. Sets are saved on this device as you enter them and
              sync when the connection is back.
            </Text>
            <Group gap="xs">
              <Button onClick={reload}>Reload</Button>
              <Button component={Link} to="/" variant="default">
                Go to Today
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack maw={520} mx="auto" py="xl" px="md">
      <Title order={2}>Something broke</Title>
      <Card withBorder>
        <Stack gap="sm" align="flex-start">
          <Text size="sm">
            Nothing you logged has been lost — sets are saved on this device as you enter them,
            before anything reaches the screen.
          </Text>
          {online ? null : (
            <Alert variant="light" color="gray" w="100%">
              <Text size="sm">
                You are also offline, which may be all this is. Try again once you are back.
              </Text>
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            If it keeps happening, this is the detail worth reporting:
          </Text>
          <Code block w="100%">
            {describe(error)}
          </Code>
          <Group gap="xs">
            <Button
              onClick={() => {
                void navigate('/', { replace: true });
              }}
            >
              Back to Today
            </Button>
            <Button variant="default" onClick={reload}>
              Reload
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
