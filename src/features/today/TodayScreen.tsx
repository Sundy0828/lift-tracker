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
import type { Session } from '@/domain/sessions';
import { localDateKey, sessionProgress } from '@/domain/sessions';
import {
  estimateWorkoutSeconds,
  exerciseSlots,
  formatEstimate,
  totalSets,
} from '@/domain/workouts';
import { SessionClock } from '@/features/logging/SessionClock';

type ResumeItemProps = {
  session: Session;
  /** True for the newest session, which is shown first and in colour. */
  newest: boolean;
  /** True when the discard button is armed and waiting for the second tap. */
  armed: boolean;
  onArm: (armed: boolean) => void;
  onDiscard: () => void;
};

/** One unfinished session, with its own resume and its own discard. */
function ResumeItem({ session, newest, armed, onArm, onDiscard }: ResumeItemProps) {
  const progress = sessionProgress(session.entries);
  const startedToday = session.performedOn === localDateKey();

  return (
    <Alert
      color={newest ? 'sky' : 'gray'}
      variant="light"
      title={newest ? 'Session in progress' : 'Unfinished session'}
      data-testid="resume-item"
    >
      <Stack gap="xs" align="flex-start">
        <Text size="sm">
          {session.workoutName} · {progress.completed} of {progress.total} sets
        </Text>
        <Group gap={6}>
          <SessionClock session={session} />
          {startedToday ? null : (
            <Text size="xs" c="dimmed">
              · started {session.performedOn}
            </Text>
          )}
        </Group>
        {startedToday ? null : (
          <Text size="xs" c="dimmed">
            Started on another day. Resume it if you are still going, or discard it — its numbers
            are not counted in any history until it is finished.
          </Text>
        )}
        <Group gap="xs" wrap="wrap">
          <Button component={Link} to={`/session/${session.id}`} size="compact-sm">
            Resume
          </Button>
          {/* Two taps, like the one on the session screen: this throws away
              logged sets and there is no undo. */}
          {armed ? (
            <>
              <Button size="compact-sm" color="red" onClick={onDiscard}>
                Discard for good
              </Button>
              <Button
                size="compact-sm"
                variant="subtle"
                onClick={() => {
                  onArm(false);
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
                onArm(true);
              }}
            >
              Discard
            </Button>
          )}
        </Group>
      </Stack>
    </Alert>
  );
}

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
  const { sessions: unfinished, isPending: activePending } = useActiveSession();
  const { profile } = useProfile();

  const [armedId, setArmedId] = useState<string | null>(null);

  /**
   * Clears one session that was never finished, leaving the others alone.
   *
   * Not awaited, like every other write (§2.8). A session with no logged set
   * is deleted rather than kept, so it never reaches history.
   */
  const discard = (session: Session): void => {
    if (uid === null) return;
    setArmedId(null);
    void abandonSession(uid, session);
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
      ) : unfinished.length === 0 ? null : (
        <Stack gap="xs">
          {unfinished.length === 1 ? null : (
            <Text size="xs" c="dimmed">
              {String(unfinished.length)} sessions were never finished. Resume or discard any one of
              them on its own.
            </Text>
          )}
          {unfinished.map((session, index) => (
            <ResumeItem
              key={session.id}
              session={session}
              newest={index === 0}
              armed={armedId === session.id}
              onArm={(armed) => {
                setArmedId(armed ? session.id : null);
              }}
              onDiscard={() => {
                discard(session);
              }}
            />
          ))}
        </Stack>
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
