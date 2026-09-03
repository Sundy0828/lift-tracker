import { Button, Code, Container, Stack, Text, Title } from '@mantine/core';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${String(error.status)} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();

  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={2}>Something broke</Title>
        <Text c="dimmed">
          Nothing you logged has been lost — sets are saved locally as you enter them.
        </Text>
        <Code block>{describe(error)}</Code>
        <Button
          onClick={() => {
            void navigate('/', { replace: true });
          }}
        >
          Back to Today
        </Button>
      </Stack>
    </Container>
  );
}
