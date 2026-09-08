import {
  Badge,
  Button,
  Card,
  Group,
  List,
  Modal,
  Progress,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { useExerciseStats, useWorkoutStats } from '@/data/hooks/useOverlayStats';
import { useProfile } from '@/data/hooks/useProfile';
import { useSession } from '@/data/hooks/useSession';
import {
  abandonSession,
  completeSession,
  saveBodyweight,
  savePerformedOn,
  saveSessionNotes,
} from '@/data/mutations/sessions';
import type { Exercise } from '@/domain/exercises';
import type { PersonalRecord } from '@/domain/overlay';
import type { Session, SessionEntry } from '@/domain/sessions';
import {
  addAdHocEntry,
  entryFor,
  entryKey as keyOf,
  exerciseEntries,
  isLastOfRound,
  isSessionFinished,
  nextUnfinishedSet,
  outstandingSets,
  removeEntry,
  restAfter,
  sessionProgress,
  sessionSeconds,
  setEntryNotes,
  skipOutstandingSets,
  toggleSetComplete,
  toggleSetSkipped,
  totalPerformedSets,
  updateSet,
} from '@/domain/sessions';
import { formatE1rm, formatSet } from '@/domain/strength';
import { formatEstimate } from '@/domain/workouts';
import type { Unit } from '@/domain/types';
import { ExercisePicker } from '@/features/workouts/ExercisePicker';
import { EntryCard } from './EntryCard';
import { RestTimerBar } from './RestTimerBar';
import { SessionClock } from './SessionClock';
import { SessionMeta } from './SessionMeta';
import { useRestTimer } from './useRestTimer';
import { useSessionDraft } from './useSessionDraft';

/**
 * The active-session screen: the hot path (§3).
 *
 * Everything it renders comes from **one session document plus two stats
 * documents**, all of which are in Firestore's local cache before the first
 * set is entered. Nothing on this screen waits on the network, and nothing
 * queries history — the overlay is a keyed read, not a search (§2.6).
 *
 * The set inputs are uncontrolled and the rows are memoized, so typing a rep
 * count touches the DOM and nothing else. Writes are debounced into the
 * session document by `useSessionDraft`.
 */
export default function ActiveSessionScreen() {
  const { sessionId = null } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const { session, isPending, notFound } = useSession(sessionId);
  const { profile } = useProfile();
  const draft = useSessionDraft(uid, session);
  const { rest, start: startRest, adjust: adjustRest, stop: stopRest } = useRestTimer();

  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  /**
   * Discarding throws away a whole workout's numbers, so it takes two taps.
   * A confirmation dialog would be the usual answer, but this button sits
   * under a thumb on a phone that is being handled mid-session — arming it in
   * place is both harder to hit by accident and quicker to dismiss.
   */
  const [armedToDiscard, setArmedToDiscard] = useState(false);
  /** Set when Finish is pressed with sets still outstanding. */
  const [confirmingEarly, setConfirmingEarly] = useState(false);

  const { stats: workoutStats } = useWorkoutStats(session?.workoutId ?? null);

  /**
   * Tier 2 is subscribed for every exercise in the session, not only the
   * unmatched ones. The same documents carry `bestE1rm`, so having them in
   * the cache is what lets completion detect PRs and write its batch without
   * a read (§2.6).
   */
  const exerciseIds = useMemo(
    () => exerciseEntries(draft.entries).map((entry) => entry.exerciseId),
    [draft.entries],
  );
  const { byExercise, lookup } = useExerciseStats(exerciseIds);

  const { apply, read } = draft;

  /**
   * The session and the default rest, readable from a handler without being
   * closed over.
   *
   * This is what makes every handler below stable across snapshots, and stable
   * handlers are what make the memoized set rows actually memoize: a fresh
   * `onReps` on each render would re-render all fifty rows every time one of
   * them was written (§3).
   */
  const latest = useRef({ session, defaultRestSeconds: profile.defaultRestSeconds });
  useEffect(() => {
    latest.current = { session, defaultRestSeconds: profile.defaultRestSeconds };
  }, [session, profile.defaultRestSeconds]);

  /**
   * Every handler below is stable — `apply` and `read` do not change identity,
   * and neither closes over the entries — which is what keeps the memoized set
   * rows from re-rendering when a sibling is written.
   */
  const onWeight = useCallback(
    (key: string, setIndex: number, value: number | null, unit: Unit) => {
      apply((entries) =>
        updateSet(entries, key, setIndex, {
          weight: value === null ? null : { value, unit },
        }),
      );
    },
    [apply],
  );

  const onReps = useCallback(
    (key: string, setIndex: number, value: number | null) => {
      apply((entries) => updateSet(entries, key, setIndex, { reps: value }));
    },
    [apply],
  );

  const onRir = useCallback(
    (key: string, setIndex: number, value: number | null) => {
      apply((entries) => updateSet(entries, key, setIndex, { rir: value }));
    },
    [apply],
  );

  const onToggleWarmup = useCallback(
    (key: string, setIndex: number) => {
      const entry = entryFor(read(), key);
      const set = entry?.sets.find((candidate) => candidate.setIndex === setIndex);
      apply((entries) =>
        updateSet(entries, key, setIndex, { isWarmup: !(set?.isWarmup ?? false) }),
      );
    },
    [apply, read],
  );

  const onToggleSkipped = useCallback(
    (key: string, setIndex: number) => {
      apply((entries) => toggleSetSkipped(entries, key, setIndex));
    },
    [apply],
  );

  const onNotes = useCallback(
    (key: string, notes: string) => {
      apply((entries) => setEntryNotes(entries, key, notes));
    },
    [apply],
  );

  const onRemoveEntry = useCallback(
    (key: string) => {
      apply((entries) => removeEntry(entries, key));
      stopRest();
    },
    [apply, stopRest],
  );

  /**
   * Completing a set is also what starts the rest, which is why it is an
   * explicit toggle rather than something inferred from the inputs being
   * filled in — the timer must not start while you are still typing.
   *
   * Un-completing stops it: the rest belonged to a set that is no longer done.
   */
  const onToggleComplete = useCallback(
    (key: string, setIndex: number) => {
      const before = read();
      const entry = entryFor(before, key);
      const set = entry?.sets.find((candidate) => candidate.setIndex === setIndex);
      const wasComplete = set !== undefined && set.completedAt !== null;

      const next = toggleSetComplete(before, key, setIndex);
      apply(() => next);

      // Un-completing stops the rest: it belonged to a set that is no longer
      // done.
      if (wasComplete) {
        stopRest();
        return;
      }

      const { session: live, defaultRestSeconds } = latest.current;
      if (entry === null || live === null) return;

      const seconds = restAfter(
        { ...live, entries: next },
        entry,
        defaultRestSeconds,
        isLastOfRound(next, key),
      );
      const upNext = nextUnfinishedSet(next, key);
      const upNextEntry = upNext === null ? null : entryFor(next, upNext.entryKey);
      startRest(
        seconds,
        upNextEntry === null ? 'Last set — session done' : `Next: ${upNextEntry.exerciseName}`,
      );
    },
    [apply, read, startRest, stopRest],
  );

  const addExercise = (exercise: Exercise): void => {
    apply((entries) =>
      addAdHocEntry(entries, { exerciseId: exercise.id, exerciseName: exercise.name }),
    );
  };

  if (isPending) return <Skeleton height={420} radius="md" />;

  if (notFound || session === null) {
    return (
      <Stack>
        <Title order={2}>Session not found</Title>
        <Button component={Link} to="/" variant="light">
          Back to today
        </Button>
      </Stack>
    );
  }

  const entries: readonly SessionEntry[] = draft.entries;
  const progress = sessionProgress(entries);
  const percent = progress.total === 0 ? 0 : (progress.completed / progress.total) * 100;
  const isDone = session.status !== 'active';
  // Every set dealt with. It does not gate finishing — you are allowed to cut a
  // session short — it only stops the primary button shouting before its time.
  const allSetsDone = isSessionFinished(entries);
  const outstanding = outstandingSets(entries);

  const announcePrs = (prs: readonly PersonalRecord[]): void => {
    for (const pr of prs) {
      notifications.show({
        title: `PR — ${pr.exerciseName}`,
        message: `${formatSet(pr.set, profile.displayUnit)} · est. 1RM ${formatE1rm(
          pr.e1rmKg,
          profile.displayUnit,
        )}${pr.previousE1rmKg === 0 ? ' (first time)' : ''}`,
        color: 'sky',
        autoClose: 6000,
      });
    }
  };

  /**
   * Writes the session and leaves.
   *
   * `finalEntries` is passed in rather than read, because finishing early
   * marks the outstanding sets skipped and the batch has to carry that — not
   * the state as it was a render ago.
   */
  const complete = (finalEntries: readonly SessionEntry[]): void => {
    if (uid === null || isDone) return;
    setFinishing(true);

    // Flushed first so the local cache agrees with the batch, including a set
    // entered a moment ago that is still inside the debounce window.
    draft.flush();

    const finished: Session = { ...session, entries: [...finalEntries] };
    const { promise, result } = completeSession(uid, finished, lookup);
    void promise;

    announcePrs(result.prs);
    const elapsed = sessionSeconds({ ...finished, completedAt: result.completedAt });
    notifications.show({
      message: `${session.workoutName} logged — ${String(
        totalPerformedSets(finalEntries),
      )} sets${elapsed === null ? '' : ` in ${formatEstimate(elapsed)}`}`,
      color: 'teal',
    });
    stopRest();
    // Back to Today rather than to the timeline: the record is written, and
    // Today is where the next thing starts.
    void navigate('/');
  };

  /**
   * Finishing is allowed at any point — cutting a session short is a normal
   * thing to do — but not silently. With sets outstanding it asks first, and
   * names them, because the alternative is discovering next week that three
   * sets went unrecorded and the overlay moved on without them.
   */
  const finish = (): void => {
    if (uid === null || isDone) return;
    if (outstanding.length > 0) {
      setConfirmingEarly(true);
      return;
    }
    complete(entries);
  };

  const finishEarly = (): void => {
    const skipped = skipOutstandingSets(entries);
    apply(() => skipped);
    setConfirmingEarly(false);
    complete(skipped);
  };

  const abandon = (): void => {
    if (uid === null) return;
    void abandonSession(uid, session.id);
    stopRest();
    notifications.show({ message: 'Session discarded', color: 'gray' });
    void navigate('/');
  };

  return (
    <>
      <Stack>
        <Stack gap={4}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Title order={2}>{session.workoutName}</Title>
            <Group gap={6}>
              {session.workoutVersion === null ? (
                <Badge variant="light" color="gray" size="sm">
                  ad-hoc
                </Badge>
              ) : (
                <Badge variant="light" color="gray" size="sm">
                  v{String(session.workoutVersion)}
                </Badge>
              )}
              {isDone ? (
                <Badge variant="light" color="teal" size="sm">
                  {session.status}
                </Badge>
              ) : null}
            </Group>
          </Group>
          <Progress value={percent} size="sm" color="sky" />
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              {progress.completed} of {progress.total} sets · {totalPerformedSets(entries)} logged
              {draft.isDirty ? ' · saving' : ''}
            </Text>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <SessionClock session={session} />
          </Group>
        </Stack>

        <SessionMeta
          session={session}
          displayUnit={profile.displayUnit}
          onPerformedOn={(performedOn) => {
            if (uid !== null) void savePerformedOn(uid, session.id, performedOn);
          }}
          onBodyweight={(bodyweight) => {
            if (uid !== null) void saveBodyweight(uid, session.id, bodyweight);
          }}
          onNotes={(notes) => {
            if (uid !== null) void saveSessionNotes(uid, session.id, notes);
          }}
        />

        {entries.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing in this session yet. Add an exercise to start logging.
          </Text>
        ) : null}

        {entries.map((entry) => {
          const key = keyOf(entry);
          return (
            <EntryCard
              key={key}
              entry={entry}
              displayUnit={profile.displayUnit}
              workoutStats={workoutStats}
              exerciseStats={byExercise.get(entry.exerciseId) ?? null}
              workoutName={session.workoutName}
              onNotes={onNotes}
              // A prescribed row belongs to the workout, so it is skipped
              // rather than deleted; only an ad-hoc addition can be taken back.
              onRemoveEntry={entry.slotId === null ? onRemoveEntry : null}
              onWeight={onWeight}
              onReps={onReps}
              onRir={onRir}
              onToggleComplete={onToggleComplete}
              onToggleSkipped={onToggleSkipped}
              onToggleWarmup={onToggleWarmup}
            />
          );
        })}

        {/*
          Only for an ad-hoc session, which starts with no slots at all — there
          it is the only way to log anything. A workout-backed session has a
          prescription, and bolting an exercise onto it mid-set is a change to
          the plan made at the worst moment; the workout editor is where that
          belongs, and next time it will be there from the start.
        */}
        {session.workoutId === null ? (
          <Button
            variant="light"
            onClick={() => {
              setPicking(true);
            }}
          >
            + Add exercise
          </Button>
        ) : null}

        <Card withBorder padding="sm">
          <Stack gap="xs">
            {isDone ? (
              <Button component={Link} to="/history" variant="light">
                Back to history
              </Button>
            ) : (
              <>
                <Button
                  onClick={finish}
                  loading={finishing}
                  variant={allSetsDone ? 'filled' : 'light'}
                >
                  {allSetsDone
                    ? 'Finish session'
                    : `Finish session (${String(progress.total - progress.completed)} sets left)`}
                </Button>
                <Button
                  variant="subtle"
                  color={armedToDiscard ? 'red' : 'gray'}
                  size="compact-sm"
                  onClick={() => {
                    if (armedToDiscard) abandon();
                    else setArmedToDiscard(true);
                  }}
                  onBlur={() => {
                    setArmedToDiscard(false);
                  }}
                >
                  {armedToDiscard
                    ? 'Tap again to discard everything logged here'
                    : 'Discard this session'}
                </Button>
              </>
            )}
          </Stack>
        </Card>
      </Stack>

      <RestTimerBar rest={rest} onAdjust={adjustRest} onStop={stopRest} />

      <Modal
        opened={confirmingEarly}
        onClose={() => {
          setConfirmingEarly(false);
        }}
        title="Finish with sets left?"
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            These are not done yet. Finishing marks them skipped, so the session records what you
            actually did and next time compares against your last real set.
          </Text>
          <List size="sm" spacing={2}>
            {outstanding.map((item) => (
              <List.Item key={item.exerciseName}>
                {item.exerciseName} — {item.sets} {item.sets === 1 ? 'set' : 'sets'}
              </List.Item>
            ))}
          </List>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                setConfirmingEarly(false);
              }}
            >
              Keep logging
            </Button>
            <Button onClick={finishEarly}>Skip them and finish</Button>
          </Group>
        </Stack>
      </Modal>

      <ExercisePicker
        opened={picking}
        workoutName={session.workoutName}
        onClose={() => {
          setPicking(false);
        }}
        onPick={(exercise) => {
          addExercise(exercise);
          setPicking(false);
        }}
      />
    </>
  );
}
