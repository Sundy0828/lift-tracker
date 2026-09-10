import { Alert, Badge, Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { Link, useLocation, useParams } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useSharedWorkout } from '@/data/hooks/useSharedWorkout';
import { ImportPanel } from './ImportPanel';
import { WorkoutPreview } from './WorkoutPreview';

/**
 * A shared workout, on the app's only public route (§2.9).
 *
 * Outside `RequireAuth` on purpose: the link has to work for someone who has
 * never heard of the app, which is the whole point of sharing one. So this
 * screen renders its own shell rather than the signed-in layout — no bottom
 * nav, nothing that assumes an account.
 *
 * A signed-out visitor sees the workout and an invitation to sign in; a
 * signed-in one sees the import options. Nothing is written either way until
 * they choose a path.
 */
export default function SharedWorkoutScreen() {
  const { shareId = null } = useParams();
  const location = useLocation();
  const { status } = useAuth();
  const { shared, isPending, notFound, revoked } = useSharedWorkout(shareId);

  if (isPending) {
    return (
      <Shell>
        <Skeleton height={320} radius="md" />
      </Shell>
    );
  }

  // Only ever reached by the share's own owner. The rules refuse a revoked
  // share to everybody else (Appendix A), so a recipient lands in `notFound`
  // below and genuinely cannot be told which of the two it was.
  if (revoked) {
    return (
      <Shell>
        <Alert color="gray" variant="light" title="This link is turned off">
          <Text size="sm">
            You revoked this link, so nobody else can open it. The workout itself is untouched —
            share it again to get a new link.
          </Text>
        </Alert>
        <BackHome />
      </Shell>
    );
  }

  if (notFound || shared === null) {
    return (
      <Shell>
        <Alert color="gray" variant="light" title="This link does not work">
          <Text size="sm">
            Either it was mistyped, or the person who shared it has turned it off. Ask them for a
            new one — a revoked link and a wrong one look the same from here, on purpose.
          </Text>
        </Alert>
        <BackHome />
      </Shell>
    );
  }

  return (
    <Shell>
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase">
          Shared workout
        </Text>
        <Title order={1} size="h2">
          {shared.body.name === '' ? 'Untitled workout' : shared.body.name}
        </Title>
        <Group gap={6}>
          <Badge size="xs" variant="light" color="sky">
            v{String(shared.versionNumber)}
          </Badge>
          {shared.customExercises.length === 0 ? null : (
            <Badge size="xs" variant="light" color="gray">
              {shared.customExercises.length === 1
                ? '1 custom exercise'
                : `${String(shared.customExercises.length)} custom exercises`}
            </Badge>
          )}
        </Group>
      </Stack>

      <WorkoutPreview body={shared.body} />

      {status === 'signed-in' ? (
        <ImportPanel shared={shared} />
      ) : (
        <Card withBorder>
          <Stack gap="xs" align="flex-start">
            <Text fw={600}>Want to use this?</Text>
            <Text size="sm" c="dimmed">
              Sign in and it can be copied into your own workouts, with every exercise it needs —
              including any the sender made up themselves.
            </Text>
            <Button
              component={Link}
              to="/sign-in"
              // Comes back here after signing in, rather than dumping someone
              // on Today having lost the link they followed.
              state={{ from: location.pathname }}
            >
              Sign in to import
            </Button>
          </Stack>
        </Card>
      )}
    </Shell>
  );
}

/**
 * The public shell.
 *
 * A max width and centred, matching the signed-in layout's main column, so
 * following a link does not land you on something that looks like a different
 * product.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Stack maw={720} mx="auto" p="md" gap="md">
      {children}
    </Stack>
  );
}

function BackHome() {
  return (
    <Group>
      <Button component={Link} to="/" variant="light" size="compact-sm">
        Go to Lift Tracker
      </Button>
    </Group>
  );
}
