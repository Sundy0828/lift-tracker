import { Alert, Badge, Button, Card, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Link } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useProfile } from '@/data/hooks/useProfile';
import { useActiveSession } from '@/data/hooks/useSession';
import { useWorkouts } from '@/data/hooks/useWorkouts';
import { abandonSession, newSessionId, startSession } from '@/data/mutations/sessions';
import { localDateKey, sessionProgress } from '@/domain/sessions';
import {
  estimateWorkoutSeconds,
  exerciseSlots,
  formatEstimate,
  totalSets,
} from '@/domain/workouts';

/**
 * The start screen: resume what is running, or start something.
 *
 * There is no plan and no schedule, so nothing here can tell you what today
 * *should* be — it offers what you have built and gets out of the way. One
 * session performs one workout, so a PUSH-then-ABS day is started twice, and
 * that is what keeps each workout's history clean (§2.6).
 */
export default function TodayScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workouts, isPending } = useWorkouts();
  const { session: active, isPending: activePending, strandedCount } = useActiveSession();
  const { profile } = useProfile();

  const [armedToDiscard, setArmedToDiscard] = useState(false);

  /**
   * Clearing a session that was never finished.
   *
   * Not awaited, like every other write (§2.8): `abandonSession` writes to the
   * local cache, the active-session listener drops the session on the next
   * snapshot, and this alert disappears — offline included. A session with no
   * logged set is deleted rather than kept, so it never reaches history.
   */
  const discard = (): void => {
    if (uid === null || active === null) return;
    setArmedToDiscard(false);
    void abandonSession(uid, active);
    notifications.show({ message: 'Session discarded', color: 'gray' });
  };

  const startAdHoc = (): void => {
    if (uid === null) return;
    const { session, promise } = startSession(uid, {
      sessionId: newSessionId(),
      workoutId: null,
      workoutVersion: null,
      workoutName: 'Ad-hoc session',
      body: null,
    });
    // Not awaited: the document is in the local cache the moment it is written,
    // so the screen it navigates to renders from cache even offline.
    void promise;
    void navigate(`/session/${session.id}`);
  };

  const live = workouts.filter((workout) => workout.archivedAt === null);

  return (
    <Stack>
      <Title order={2}>Today</Title>

      {activePending ? (
        <Skeleton height={92} radius="md" />
      ) : active === null ? null : (
        <Alert color="sky" variant="light" title="Session in progress">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {active.workoutName} · {sessionProgress(active.entries).completed} of{' '}
              {sessionProgress(active.entries).total} sets
              {active.performedOn === localDateKey() ? '' : ` · ${active.performedOn}`}
            </Text>
            {/*
              A session from a day that is not today is almost always a crash or
              a closed tab rather than a workout still under way, so the reason
              to discard is named rather than left to be worked out.
            */}
            {active.performedOn === localDateKey() ? null : (
              <Text size="xs" c="dimmed">
                Started on another day. Resume it if you are still going, or discard it — its
                numbers are not counted in any history until it is finished.
              </Text>
            )}
            {strandedCount === 0 ? null : (
              <Text size="xs" c="dimmed">
                {strandedCount === 1
                  ? 'One older session was also never finished. Clearing this one will offer it next.'
                  : `${String(strandedCount)} older sessions were also never finished. Clearing this one will offer them next.`}
              </Text>
            )}
            <Group gap="xs" wrap="wrap">
              <Button component={Link} to={`/session/${active.id}`} size="compact-sm">
                Resume
              </Button>
              {/* Two taps, like the one on the session screen: this throws
                  away logged sets and there is no undo. */}
              {armedToDiscard ? (
                <>
                  <Button size="compact-sm" color="red" onClick={discard}>
                    Discard for good
                  </Button>
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    onClick={() => {
                      setArmedToDiscard(false);
                    }}
                  >
                    Keep it
                  </Button>
                </>
              ) : (
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    setArmedToDiscard(true);
                  }}
                >
                  Discard
                </Button>
              )}
            </Group>
          </Stack>
        </Alert>
      )}

      {isPending ? (
        <Skeleton height={200} radius="md" />
      ) : live.length === 0 ? (
        <Card withBorder>
          <Stack gap="xs" align="flex-start">
            <Text fw={600}>No workouts yet</Text>
            <Text size="sm" c="dimmed">
              A workout is one reusable list — PUSH, PULL, ABS. Build one and it is here every time.
            </Text>
            <Button component={Link} to="/workouts" variant="light" fullWidth>
              Build a workout
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Start a workout
          </Text>
          {live.map((workout) => (
            <Card key={workout.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>
                    {workout.name === '' ? 'Untitled workout' : workout.name}
                  </Text>
                  <Group gap={6}>
                    <Badge size="xs" variant="light" color="gray">
                      {exerciseSlots(workout.slots).length} exercises
                    </Badge>
                    <Badge size="xs" variant="light" color="gray">
                      {totalSets(workout)} sets
                    </Badge>
                    {workout.slots.length === 0 ? null : (
                      <Badge size="xs" variant="light" color="gray">
                        ~
                        {formatEstimate(
                          estimateWorkoutSeconds(workout, profile.defaultRestSeconds),
                        )}
                      </Badge>
                    )}
                  </Group>
                </Stack>
                <Button
                  component={Link}
                  to={`/session/start/${workout.id}`}
                  size="compact-sm"
                  disabled={workout.slots.length === 0}
                >
                  Start
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Card withBorder padding="sm">
        <Stack gap="xs" align="flex-start">
          <Text size="sm" fw={600}>
            Something else
          </Text>
          <Text size="xs" c="dimmed">
            An ad-hoc session logs whatever you feel like doing. It feeds each exercise&apos;s own
            history, but no workout&apos;s — there is no workout for it to belong to.
          </Text>
          <Button variant="default" fullWidth onClick={startAdHoc}>
            Start an ad-hoc session
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
