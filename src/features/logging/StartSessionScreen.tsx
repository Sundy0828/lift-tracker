import { Button, Skeleton, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useWorkout } from '@/data/hooks/useWorkout';
import { newSessionId, startSession } from '@/data/mutations/sessions';
import { publishWorkoutVersion } from '@/data/mutations/workouts';
import { diffWorkout } from '@/domain/workoutDiff';
import type { WorkoutBody } from '@/domain/workouts';
import { isDateKey } from '@/domain/sessions';

/**
 * Starts a session and redirects to it.
 *
 * Its own route rather than a button handler, for two reasons: a workout needs
 * its version history loaded before a session can name the version it is being
 * performed against, and subscribing to that for every row of a workout list
 * would be a listener per workout.
 *
 * **A changed workout publishes itself here** (§2.5). A session records
 * `workoutId` plus `workoutVersion`, and that pair has to point at a snapshot
 * that actually describes what was performed. Starting against unpublished
 * edits would record a version number whose snapshot says something else, and
 * next month's archaeology view would quietly lie. Publishing first is the only
 * answer that keeps old sessions correct without asking the user a question
 * they cannot evaluate mid-warmup.
 */
export default function StartSessionScreen() {
  const { workoutId = null } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const { workout, versions, isPending, notFound } = useWorkout(workoutId);
  // Started exactly once, even though the workout listener fires repeatedly.
  const started = useRef(false);

  useEffect(() => {
    if (started.current || uid === null || workout === null) return;
    started.current = true;

    const body: WorkoutBody = {
      name: workout.name,
      slots: workout.slots,
      groupRest: workout.groupRest,
    };
    const published = versions[0] ?? null;
    const pending = diffWorkout(published, body);

    let version = workout.currentVersion;
    if (pending.hasChanges) {
      const { promise, result } = publishWorkoutVersion(uid, workout, body, published);
      void promise;
      version = result.versionNumber;
      notifications.show({
        message: `Published v${String(result.versionNumber)} — ${result.changeSummary}`,
        color: 'amber',
      });
    }

    const requested = search.get('on');
    const { session, promise } = startSession(uid, {
      sessionId: newSessionId(),
      workoutId: workout.id,
      // Zero means nothing has ever been published — only reachable for a
      // workout with no exercises at all — and there is no snapshot to name.
      workoutVersion: version === 0 ? null : version,
      workoutName: workout.name,
      body,
      // Backdating is supported from the link, so logging yesterday's workout
      // does not start by correcting the date.
      ...(requested !== null && isDateKey(requested) ? { performedOn: requested } : {}),
    });
    void promise;

    // Replaced, not pushed: going back should land on the workout list, not on
    // a screen that would start a second session.
    void navigate(`/session/${session.id}`, { replace: true });
  }, [uid, workout, versions, search, navigate]);

  if (isPending) return <Skeleton height={200} radius="md" />;

  if (notFound || workout === null) {
    return (
      <Stack>
        <Title order={2}>Workout not found</Title>
        <Text size="sm" c="dimmed">
          It may have been deleted.
        </Text>
        <Button component={Link} to="/workouts" variant="light">
          Back to workouts
        </Button>
      </Stack>
    );
  }

  return <Skeleton height={200} radius="md" />;
}
