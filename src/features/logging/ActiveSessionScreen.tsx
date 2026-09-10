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
  lastCompletedSet,
  nextUnfinishedSet,
  outstandingSets,
  removeEntry,
  restAfter,
  sessionProgress,
  sessionSeconds,
  setEntryNotes,
  settleOutstandingSets,
  toggleSetComplete,
  toggleSetSkipped,
  totalPerformedSets,
  updateSet,
} from '@/domain/sessions';
import { formatE1rm, formatSet } from '@/domain/strength';
import type { Unit } from '@/domain/types';
import { formatEstimate } from '@/domain/workouts';
import { ExercisePicker } from '@/features/workouts/ExercisePicker';
import { EntryCard } from './EntryCard';
import { RestTimerBar } from './RestTimerBar';
import { SessionClock } from './SessionClock';
import { SessionMeta } from './SessionMeta';
import { useRestTimer } from './useRestTimer';
import { useSessionDraft } from './useSessionDraft';
import { useWakeLock } from './useWakeLock';

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
  const {
    rest,
    start: startRest,
    resumeFrom: resumeRest,
    isOwnedBy: restOwnedBy,
    adjust: adjustRest,
    stop: stopRest,
  } = useRestTimer();

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

  // Held for the whole live session, not just while resting: the gap between
  // sets is exactly when the phone is face-up on a bench being ignored.
  // Derived here rather than from `isDone` below, which is computed past the
  // early returns and so cannot feed a hook.
  useWakeLock(session?.status === 'active');

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
   * How long to rest after a given set, and what to call the countdown.
   *
   * Shared by starting a rest and by handing one back to an earlier set, so a
   * fallback rest is the one that set was actually owed rather than a default.
   */
  const restFor = useCallback(
    (entries: readonly SessionEntry[], key: string): { seconds: number; label: string } | null => {
      const { session: live, defaultRestSeconds } = latest.current;
      const entry = entryFor(entries, key);
      if (entry === null || live === null) return null;

      const seconds = restAfter(
        { ...live, entries: [...entries] },
        entry,
        defaultRestSeconds,
        isLastOfRound(entries, key),
      );
      const upNext = nextUnfinishedSet(entries, key);
      const upNextEntry = upNext === null ? null : entryFor(entries, upNext.entryKey);
      return {
        seconds,
        label:
          upNextEntry === null ? 'Last set — session done' : `Next: ${upNextEntry.exerciseName}`,
      };
    },
    [],
  );

  /**
   * Completing a set is also what starts its rest, which is why it is an
   * explicit toggle rather than something inferred from the inputs being
   * filled in — the timer must not start while you are still typing.
   */
  const onToggleComplete = useCallback(
    (key: string, setIndex: number) => {
      const before = read();
      const entry = entryFor(before, key);
      const set = entry?.sets.find((candidate) => candidate.setIndex === setIndex);
      const wasComplete = set !== undefined && set.completedAt !== null;

      const next = toggleSetComplete(before, key, setIndex);
      apply(() => next);

      /**
       * Un-ticking only ends the rest if it was *this* set's rest. Correcting
       * a mis-tap used to kill the countdown outright, which threw away the
       * rest the set before it was still owed — so instead the timer falls
       * back to whichever set most recently remains ticked, resumed from when
       * that set actually finished. If that rest has already elapsed, or
       * nothing is left ticked, it simply ends.
       */
      if (wasComplete) {
        if (!restOwnedBy({ entryKey: key, setIndex })) return;

        const fallback = lastCompletedSet(next);
        const owed = fallback === null ? null : restFor(next, fallback.entryKey);
        if (fallback === null || owed === null) {
          stopRest();
          return;
        }
        resumeRest(fallback.completedAt, owed.seconds, owed.label, {
          entryKey: fallback.entryKey,
          setIndex: fallback.setIndex,
        });
        return;
      }

      const owed = restFor(next, key);
      if (owed === null) return;
      startRest(owed.seconds, owed.label, { entryKey: key, setIndex });
    },
    [apply, read, restFor, restOwnedBy, resumeRest, startRest, stopRest],
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
  const toComplete = outstanding.filter((item) => item.toComplete > 0);
  const toSkip = outstanding.filter((item) => item.toSkip > 0);

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
    const settled = settleOutstandingSets(entries);
    apply(() => settled.entries);
    setConfirmingEarly(false);
    complete(settled.entries);
  };

  const abandon = (): void => {
    if (uid === null) return;
    void abandonSession(uid, session);
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
                    ? totalPerformedSets(entries) === 0
                      ? 'Tap again to discard it'
                      : 'Tap again to discard everything logged here'
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
          {toComplete.length === 0 ? null : (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                Counted as done
              </Text>
              <Text size="xs" c="dimmed">
                Reps are entered for these but they were never ticked, so they are recorded as
                performed rather than thrown away.
              </Text>
              <List size="sm" spacing={2}>
                {toComplete.map((item) => (
                  <List.Item key={item.exerciseName}>
                    {item.exerciseName} — {item.toComplete} {item.toComplete === 1 ? 'set' : 'sets'}
                  </List.Item>
                ))}
              </List>
            </Stack>
          )}

          {toSkip.length === 0 ? null : (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                Skipped
              </Text>
              <Text size="xs" c="dimmed">
                Nothing was entered for these. They stay on the session as skipped and feed no
                history, so next time compares against your last real set.
              </Text>
              <List size="sm" spacing={2}>
                {toSkip.map((item) => (
                  <List.Item key={item.exerciseName}>
                    {item.exerciseName} — {item.toSkip} {item.toSkip === 1 ? 'set' : 'sets'}
                  </List.Item>
                ))}
              </List>
            </Stack>
          )}
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                setConfirmingEarly(false);
              }}
            >
              Keep logging
            </Button>
            <Button onClick={finishEarly}>
              {toSkip.length === 0 ? 'Tick them and finish' : 'Settle them and finish'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ExercisePicker
        opened={picking}
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
