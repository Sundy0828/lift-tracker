import { useAuth } from '@lift/data/hooks/useAuth';
import { useActiveSession } from '@lift/data/hooks/useSession';
import { useWorkout } from '@lift/data/hooks/useWorkout';
import { newSessionId, startSession } from '@lift/data/mutations/sessions';
import { publishWorkoutVersion } from '@lift/data/mutations/workouts';
import { isDateKey } from '@lift/domain/sessions';
import { hasUnpublishedChanges } from '@lift/domain/workoutDiff';
import type { WorkoutBody } from '@lift/domain/workouts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Screen } from '../../../components/Screen';
import { Body, Button, Loading, Title } from '../../../components/ui';

/**
 * Starts a session and replaces itself with it. The web's `StartSessionScreen`:
 * its own route because a session has to name the published version it is
 * performed against, which needs the workout's version history loaded.
 *
 * **A changed workout publishes itself here** (§2.5), so `workoutVersion`
 * always points at a snapshot that describes what was performed.
 *
 * `on` (YYYY-MM-DD) backdates the session, as the web's `?on=` does, so
 * logging yesterday's workout does not start by correcting the date.
 *
 * One rule the web does not need: an unfinished session of this same workout
 * is resumed instead of starting a second one. A double tap on a phone is
 * easy, and two live sessions of one workout are never what was meant.
 */
export default function StartSession() {
  const { workoutId, on } = useLocalSearchParams<{ workoutId: string; on?: string }>();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workout, versions, isPending, notFound } = useWorkout(workoutId);
  const { sessions: unfinished, isPending: activePending } = useActiveSession();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || uid === null || workout === null || activePending) return;
    started.current = true;

    const existing = unfinished.find((session) => session.workoutId === workout.id);
    if (existing !== undefined) {
      router.replace({ pathname: '/session/[sessionId]', params: { sessionId: existing.id } });
      return;
    }

    const body: WorkoutBody = {
      name: workout.name,
      slots: workout.slots,
      groupRest: workout.groupRest,
    };
    const published = versions[0] ?? null;

    let version = workout.currentVersion;
    /** Said on the session screen, as the web's toast: publishing was not asked for. */
    let publishedNotice: string | null = null;
    // Guarded: until the version listener answers, `published` is null for a
    // workout that has snapshots, and a raw diff would publish a duplicate.
    if (hasUnpublishedChanges(published, workout.currentVersion, body)) {
      const { promise, result } = publishWorkoutVersion(uid, workout, body, published);
      void promise;
      version = result.versionNumber;
      publishedNotice = `Published v${String(result.versionNumber)} — ${result.changeSummary}`;
    }

    const { session, promise } = startSession(uid, {
      sessionId: newSessionId(),
      workoutId: workout.id,
      workoutVersion: version === 0 ? null : version,
      workoutName: workout.name,
      body,
      ...(on !== undefined && isDateKey(on) ? { performedOn: on } : {}),
    });
    void promise;

    // Replaced, so Back lands on the list rather than on a second start.
    router.replace({
      pathname: '/session/[sessionId]',
      params:
        publishedNotice === null
          ? { sessionId: session.id }
          : { sessionId: session.id, notice: publishedNotice },
    });
  }, [uid, workout, versions, unfinished, activePending, on]);

  if (isPending) return <Loading />;

  if (notFound || workout === null) {
    return (
      <Screen>
        <Title>Workout not found</Title>
        <Body dimmed>It may have been deleted.</Body>
        <Button
          variant="subtle"
          label="Back"
          onPress={() => {
            router.back();
          }}
        />
      </Screen>
    );
  }

  return <Loading />;
}
