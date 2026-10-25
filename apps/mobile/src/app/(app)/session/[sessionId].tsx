import { useAuth } from '@lift/data/hooks/useAuth';
import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { useExerciseStats, useWorkoutStats } from '@lift/data/hooks/useOverlayStats';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useRestTimer } from '@lift/data/hooks/useRestTimer';
import { useSession } from '@lift/data/hooks/useSession';
import { useSessionDraft } from '@lift/data/hooks/useSessionDraft';
import { setDisplayUnit } from '@lift/data/mutations/profile';
import {
  abandonSession,
  completeSession,
  saveBodyweight,
  savePerformedOn,
  saveSessionNotes,
} from '@lift/data/mutations/sessions';
import type { Exercise } from '@lift/domain/exercises';
import type { DistanceUnit, Measure } from '@lift/domain/measure';
import type { PersonalRecord } from '@lift/domain/overlay';
import { restOwner, restPlan, restTag, restToResume } from '@lift/domain/rest';
import type { Session, SessionEntry } from '@lift/domain/sessions';
import {
  addAdHocEntry,
  amountPatch,
  entryFor,
  entryMeasure,
  entryKey as keyOf,
  exerciseEntries,
  isFullyEntered,
  isSessionFinished,
  lastCompletedSet,
  looksTransposed,
  nextUnfinishedSet,
  outstandingSets,
  removeEntry,
  sessionProgress,
  sessionSeconds,
  setEntryMeasure,
  setEntryNotes,
  setsMissingNumbers,
  settleOutstandingSets,
  toggleSetComplete,
  toggleSetSkipped,
  totalPerformedSets,
  updateSet,
} from '@lift/domain/sessions';
import { formatE1rm, formatSet } from '@lift/domain/strength';
import type { Unit } from '@lift/domain/types';
import { formatEstimate } from '@lift/domain/workouts';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform as OS,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet } from '../../../components/editor/controls';
import { ExerciseDetail } from '../../../components/editor/ExerciseDetail';
import { ExercisePicker } from '../../../components/editor/ExercisePicker';
import { EntryCard } from '../../../components/session/EntryCard';
import { RestPill, RestTimerBar } from '../../../components/session/RestTimerBar';
import { SessionClock } from '../../../components/session/SessionClock';
import { SessionMeta } from '../../../components/session/SessionMeta';
import { SyncStrip } from '../../../components/SyncStrip';
import { BackArrow, Badge, Body, Button, Loading, Title } from '../../../components/ui';
import { onRestDone, scheduledRestEndsAt } from '../../../platform';
import { usePalette } from '../../../theme';

/** How long a notice stays up, and the shortest gap between two set queries. */
const NOTICE_MS = 8000;

/** How long the discard button stays armed after the first tap. */
const ARMED_MS = 4000;

function setRef(entryKey: string, setIndex: number): string {
  return `${entryKey} ${String(setIndex)}`;
}

/** What the rest bar and the notification say comes next. */
function restLabel(nextExerciseName: string | null): string {
  return nextExerciseName === null ? 'Last set — session done' : `Next: ${nextExerciseName}`;
}

/**
 * The exercise a resumed session should scroll to, or null to stay put: the
 * web's `useResumeScroll` rule. Only once something is logged, and never
 * when the next set is already the first row.
 */
function resumeTarget(entries: readonly SessionEntry[]): string | null {
  if (sessionProgress(entries).completed === 0) return null;
  const target = nextUnfinishedSet(entries);
  if (target === null) return null;
  const first = exerciseEntries(entries)[0];
  if (first !== undefined && keyOf(first) === target.entryKey) return null;
  return target.entryKey;
}

/** Holds the screen on while mounted. A component, so it can be switched by rendering. */
function KeepAwake() {
  useKeepAwake();
  return null;
}

/** A session's records, as one alert's text. */
function describePrs(prs: readonly PersonalRecord[], unit: Unit): string {
  return prs
    .map((pr) => {
      const first = pr.isFirst ? ' (first time)' : '';
      return `${pr.exerciseName}: ${formatSet(pr.set, unit)} · est. 1RM ${formatE1rm(pr.e1rmKg, unit)}${first}`;
    })
    .join('\n');
}

/**
 * The active-session screen: the hot path (§3), and the reason the app exists.
 *
 * The logic is the web's `ActiveSessionScreen`, handler for handler: one
 * session document plus two stats documents, all in the local cache before
 * the first set, a debounced working copy (`useSessionDraft`) and stable
 * handlers so the memoized set rows stay put while a sibling is written.
 *
 * Three things are the phone's own:
 *
 * - The rest's end is scheduled with the OS (see ../../../platform), so it
 *   arrives with the screen locked and the app killed.
 * - A rest still running when the app was killed is rebuilt on return from
 *   the set that earned it (`restToResume`). Nothing else about it is stored.
 * - The screen is held on for the whole live session, not only while resting:
 *   between sets is exactly when the phone lies face-up being ignored.
 */
export default function ActiveSession() {
  const palette = usePalette();
  // `notice` comes from the start screen when starting published a version.
  const { sessionId, notice: startNotice } = useLocalSearchParams<{
    sessionId: string;
    notice?: string;
  }>();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const { session, isPending, notFound } = useSession(sessionId);
  const { resolver } = useExerciseLibrary();
  const { profile, isPending: profilePending } = useProfile();
  const draft = useSessionDraft(uid, session);
  const {
    rest,
    start: startRest,
    resumeFrom: resumeRest,
    isOwnedBy: restOwnedBy,
    peek: peekRest,
    adjust: adjustRest,
    stop: stopRest,
  } = useRestTimer();

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [armedToDiscard, setArmedToDiscard] = useState(false);
  const [confirmingEarly, setConfirmingEarly] = useState(false);
  /** Set when Finish is pressed with done sets still short of a number. */
  const [showingMissing, setShowingMissing] = useState(false);
  /** A one-line notice above the rest bar; the phone's stand-in for a toast. */
  const [notice, setNotice] = useState<string | null>(startNotice ?? null);

  const { stats: workoutStats } = useWorkoutStats(session?.workoutId ?? null);
  const exerciseIds = useMemo(
    () => exerciseEntries(draft.entries).map((entry) => entry.exerciseId),
    [draft.entries],
  );
  const { byExercise, lookup } = useExerciseStats(exerciseIds);
  const { apply, read } = draft;

  /** The session and the profile, readable from a stable handler. */
  const latest = useRef({
    session,
    defaultRestSeconds: profile.defaultRestSeconds,
    autoStartRest: profile.autoStartRest,
    displayUnit: profile.displayUnit,
  });
  useEffect(() => {
    latest.current = {
      session,
      defaultRestSeconds: profile.defaultRestSeconds,
      autoStartRest: profile.autoStartRest,
      displayUnit: profile.displayUnit,
    };
  }, [session, profile.defaultRestSeconds, profile.autoStartRest, profile.displayUnit]);

  /** The exercise whose instructions are open over the session. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  /**
   * Scrolls a resumed session to where it left off, once per session: a long
   * workout reopened from the notification otherwise lands on sets finished
   * forty minutes ago. Each row reports where it sits as it lays out.
   */
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrolledFor = useRef<string | null>(null);
  /** Where each exercise sits, for "Show me" on a set missing a number. */
  const rowY = useRef(new Map<string, number>());
  const onRowLayout = useCallback((key: string, y: number) => {
    rowY.current.set(key, y);
    const live = latest.current.session;
    if (live === null || scrolledFor.current === live.id) return;
    const target = resumeTarget(live.entries);
    if (target === null) {
      scrolledFor.current = live.id;
      return;
    }
    if (key !== target) return;
    scrolledFor.current = live.id;
    scroller.current?.scrollTo({ y: Math.max(0, y - 120), animated: false });
  }, []);

  const nudged = useRef(new Set<string>());
  const nudgedAt = useRef(0);
  const rested = useRef(new Set<string>());

  useEffect(() => {
    if (notice === null) return;
    const timeout = setTimeout(() => {
      setNotice(null);
    }, NOTICE_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [notice]);

  useEffect(() => {
    if (!armedToDiscard) return;
    const timeout = setTimeout(() => {
      setArmedToDiscard(false);
    }, ARMED_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [armedToDiscard]);

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

  const onNotes = useCallback(
    (key: string, notes: string) => {
      apply((entries) => setEntryNotes(entries, key, notes));
    },
    [apply],
  );

  /** Writes the rest actually taken onto the set that earned it. */
  const recordRest = useCallback(
    (entries: readonly SessionEntry[]): SessionEntry[] => {
      const running = peekRest();
      if (running === null) return [...entries];
      return updateSet(entries, running.owner.entryKey, running.owner.setIndex, {
        restTakenSeconds: Math.round((Date.now() - running.startedAt) / 1000),
      });
    },
    [peekRest],
  );

  const endRest = useCallback(() => {
    if (peekRest() === null) return;
    apply(recordRest);
    stopRest();
  }, [apply, peekRest, recordRest, stopRest]);

  // "Done resting" on the notification brings the app up and lands here.
  useEffect(() => onRestDone(endRest), [endRest]);

  const onRemoveEntry = useCallback(
    (key: string) => {
      endRest();
      apply((entries) => removeEntry(entries, key));
    },
    [apply, endRest],
  );

  const restFor = useCallback(
    (entries: readonly SessionEntry[], key: string): { seconds: number; label: string } | null => {
      const { session: live, defaultRestSeconds } = latest.current;
      if (live === null) return null;
      const plan = restPlan(live, entries, key, defaultRestSeconds);
      return plan === null
        ? null
        : { seconds: plan.seconds, label: restLabel(plan.nextExerciseName) };
    },
    [],
  );

  /** One query per set when its load and reps read as swapped. */
  const nudgeTransposed = useCallback(
    (entries: readonly SessionEntry[], key: string, index: number) => {
      const ref = setRef(key, index);
      if (nudged.current.has(ref) || Date.now() - nudgedAt.current < NOTICE_MS) return;
      const entry = entryFor(entries, key);
      const set = entry?.sets.find((candidate) => candidate.setIndex === index);
      if (entry === null || set === undefined || !looksTransposed(set, entry.prescription)) return;

      nudged.current.add(ref);
      nudgedAt.current = Date.now();
      setNotice(
        `Double-check ${formatSet(set, latest.current.displayUnit)}: the load and the reps may be the wrong way round.`,
      );
    },
    [],
  );

  const startRestFor = useCallback(
    (entries: readonly SessionEntry[], key: string, setIndex: number) => {
      rested.current.add(setRef(key, setIndex));
      if (restOwnedBy({ entryKey: key, setIndex })) return;
      const owed = restFor(entries, key);
      if (owed === null) return;
      startRest(owed.seconds, owed.label, { entryKey: key, setIndex });
    },
    [restFor, restOwnedBy, startRest],
  );

  /** A row holding every number it asks for is ticked, and its rest starts. */
  const onSetEntered = useCallback(
    (key: string, setIndex: number) => {
      const entries = read();
      const entry = entryFor(entries, key);
      const set = entry?.sets.find((candidate) => candidate.setIndex === setIndex);
      if (entry === null || set === undefined) return;
      if (!isFullyEntered(set, entry.prescription, entryMeasure(entry))) return;

      nudgeTransposed(entries, key, setIndex);

      if (set.completedAt !== null) return;
      if (rested.current.has(setRef(key, setIndex))) return;
      if (!latest.current.autoStartRest) return;

      const next = toggleSetComplete(recordRest(entries), key, setIndex);
      apply(() => next);
      startRestFor(next, key, setIndex);
    },
    [apply, nudgeTransposed, read, recordRest, startRestFor],
  );

  const onWeight = useCallback(
    (key: string, setIndex: number, value: number | null, unit: Unit) => {
      apply((entries) =>
        updateSet(entries, key, setIndex, { weight: value === null ? null : { value, unit } }),
      );
      onSetEntered(key, setIndex);
    },
    [apply, onSetEntered],
  );

  /** Reps, seconds or a distance, whichever the row is counted in. */
  const onAmount = useCallback(
    (key: string, setIndex: number, value: number | null) => {
      apply((entries) => {
        const entry = entryFor(entries, key);
        return entry === null
          ? [...entries]
          : updateSet(entries, key, setIndex, amountPatch(entry, value));
      });
      onSetEntered(key, setIndex);
    },
    [apply, onSetEntered],
  );

  /** An ad-hoc row's measure, chosen before anything is logged on it. */
  const onMeasure = useCallback(
    (key: string, measure: Measure, unit: DistanceUnit) => {
      apply((entries) => setEntryMeasure(entries, key, measure, unit));
    },
    [apply],
  );

  const onRir = useCallback(
    (key: string, setIndex: number, value: number | null) => {
      apply((entries) => updateSet(entries, key, setIndex, { rir: value }));
      onSetEntered(key, setIndex);
    },
    [apply, onSetEntered],
  );

  /**
   * Keeps the rest running only while the set that earned it still counts as
   * done. Once that set is un-ticked or skipped, the rest falls back to the
   * last set still ticked, resumed from when that set was finished; if that
   * rest has already run out, or nothing is ticked any more, it ends.
   *
   * Un-ticking another set leaves a rest alone, so correcting a mis-tap never
   * throws away the rest the set before it was owed. But a rest whose owner
   * was skipped first is checked again then, so it cannot outlive every set
   * that could have earned it.
   */
  const releaseRest = useCallback(
    (entries: readonly SessionEntry[]) => {
      const running = peekRest();
      if (running === null) return;
      const owner = entryFor(entries, running.owner.entryKey)?.sets.find(
        (candidate) => candidate.setIndex === running.owner.setIndex,
      );
      if (owner?.skipped === false && owner.completedAt !== null) return;

      const fallback = lastCompletedSet(entries);
      const owed = fallback === null ? null : restFor(entries, fallback.entryKey);
      if (fallback === null || owed === null) {
        stopRest();
        return;
      }
      resumeRest(fallback.completedAt, owed.seconds, owed.label, {
        entryKey: fallback.entryKey,
        setIndex: fallback.setIndex,
      });
    },
    [peekRest, restFor, resumeRest, stopRest],
  );

  const onToggleSkipped = useCallback(
    (key: string, setIndex: number) => {
      const next = toggleSetSkipped(read(), key, setIndex);
      apply(() => next);
      releaseRest(next);
    },
    [apply, read, releaseRest],
  );

  /**
   * Ticks a set done, or undoes that. Un-ticking only ends the rest if it was
   * this set's; otherwise the rest falls back to the last set still ticked,
   * resumed from when that set was finished (see the web screen).
   */
  const onToggleComplete = useCallback(
    (key: string, setIndex: number) => {
      const before = read();
      const entry = entryFor(before, key);
      const set = entry?.sets.find((candidate) => candidate.setIndex === setIndex);
      const wasComplete = set !== undefined && set.completedAt !== null;
      const wasResting = restOwnedBy({ entryKey: key, setIndex });

      const next = toggleSetComplete(before, key, setIndex);
      apply(() => (wasComplete || wasResting ? next : recordRest(next)));
      if (!wasComplete) nudgeTransposed(next, key, setIndex);

      if (wasComplete) {
        releaseRest(next);
        return;
      }

      if (!latest.current.autoStartRest) {
        stopRest();
        return;
      }
      startRestFor(next, key, setIndex);
    },
    [apply, nudgeTransposed, read, recordRest, releaseRest, restOwnedBy, startRestFor, stopRest],
  );

  const onShowExercise = useCallback((exerciseId: string) => {
    setDetailId(exerciseId);
  }, []);

  const startRestManually = useCallback(() => {
    const entries = read();
    const last = lastCompletedSet(entries);
    if (last === null) return;
    const owed = restFor(entries, last.entryKey);
    if (owed === null) return;
    startRest(owed.seconds, owed.label, { entryKey: last.entryKey, setIndex: last.setIndex });
  }, [read, restFor, startRest]);

  /**
   * A rest that was running when the app was killed, picked up again once.
   * Waits for the profile, since the rest length may be its default.
   *
   * The deadline comes from the alerts still scheduled with the OS when there
   * are any, because only they remember a −15s/+15s; otherwise from the plan.
   */
  const resumed = useRef<string | null>(null);
  // Not the effect's own cleanup: that runs on every session snapshot, and
  // would throw away a lookup still in flight.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (session === null || profilePending || resumed.current === session.id) return;
    resumed.current = session.id;
    if (session.status !== 'active' || !profile.autoStartRest) return;

    const owner = restOwner(session.entries);
    if (owner === null) return;

    void scheduledRestEndsAt(restTag(owner)).then((knownEndsAt) => {
      // Gone from the screen, or a set ticked while the lookup ran has
      // started its own rest.
      if (!mounted.current || peekRest() !== null) return;
      const owed = restToResume(
        session,
        session.entries,
        profile.defaultRestSeconds,
        Date.now(),
        knownEndsAt,
      );
      if (owed === null) return;
      rested.current.add(setRef(owed.owner.entryKey, owed.owner.setIndex));
      resumeRest(owed.startedAt, owed.seconds, restLabel(owed.nextExerciseName), owed.owner);
    });
  }, [
    session,
    profilePending,
    profile.autoStartRest,
    profile.defaultRestSeconds,
    peekRest,
    resumeRest,
  ]);

  if (isPending) return <Loading />;

  if (notFound || session === null) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={styles.content}>
          <Title>Session not found</Title>
          <Button
            variant="subtle"
            label="Back to today"
            onPress={() => {
              router.replace('/');
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const entries: readonly SessionEntry[] = draft.entries;
  const progress = sessionProgress(entries);
  const isDone = session.status !== 'active';
  const allSetsDone = isSessionFinished(entries);
  const outstanding = outstandingSets(entries);
  const toComplete = outstanding.filter((item) => item.toComplete > 0);
  const toSkip = outstanding.filter((item) => item.toSkip > 0);
  const missing = setsMissingNumbers(entries);
  const unit = profile.displayUnit;

  const complete = async (finalEntries: readonly SessionEntry[]): Promise<void> => {
    if (uid === null || isDone || finishing) return;
    setFinishing(true);
    setFinishError(null);
    draft.flush();

    const finished: Session = { ...session, entries: [...finalEntries] };
    let result;
    try {
      // Awaited: offline that is the queued write, online the server's answer.
      result = await completeSession(uid, finished, lookup);
    } catch {
      setFinishing(false);
      setFinishError('The session could not be saved. Everything you logged is still here.');
      return;
    }

    stopRest();
    const elapsed = sessionSeconds({ ...finished, completedAt: result.completedAt });
    const summary = `${String(totalPerformedSets(finalEntries))} sets${
      elapsed === null ? '' : ` in ${formatEstimate(elapsed)}`
    }`;
    const [only] = result.prs;
    const title =
      only === undefined
        ? `${session.workoutName} logged`
        : result.prs.length === 1
          ? `PR — ${only.exerciseName}`
          : `${String(result.prs.length)} personal records`;
    const message =
      only === undefined
        ? summary
        : `${describePrs(result.prs, unit)}\n\n${session.workoutName}: ${summary}`;

    // Back to Today: the record is written, and Today is where the next thing starts.
    router.replace('/');
    Alert.alert(title, message);
  };

  const finish = (): void => {
    if (uid === null || isDone) return;
    // A set that counts as done has to hold its numbers first: otherwise it
    // reaches history half-entered, or not at all.
    if (missing.length > 0) {
      setShowingMissing(true);
      return;
    }
    if (outstanding.length > 0) {
      setConfirmingEarly(true);
      return;
    }
    void complete(entries);
  };

  const finishEarly = (): void => {
    const settled = settleOutstandingSets(entries);
    apply(() => settled.entries);
    setConfirmingEarly(false);
    void complete(settled.entries);
  };

  const addExercise = (exercise: Exercise): void => {
    apply((current) =>
      addAdHocEntry(current, { exerciseId: exercise.id, exerciseName: exercise.name }),
    );
  };

  const detail = detailId === null ? null : resolver.resolve(detailId);

  const abandon = (): void => {
    if (uid === null) return;
    void abandonSession(uid, session);
    stopRest();
    router.replace('/');
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      {isDone ? null : <KeepAwake />}
      <SyncStrip />
      <KeyboardAvoidingView style={styles.root} behavior={OS.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.headerRow}>
            <BackArrow fallback="/" />
            <View style={styles.headerText}>
              <Title>{session.workoutName}</Title>
              <View style={styles.badges}>
                <Badge
                  label={
                    session.workoutVersion === null
                      ? 'ad-hoc'
                      : `v${String(session.workoutVersion)}`
                  }
                />
                {isDone ? <Badge tone="success" label={session.status} /> : null}
              </View>
              <View style={styles.inline}>
                <Text style={[styles.small, { color: palette.dimmed }]}>
                  {String(progress.completed)} of {String(progress.total)} sets ·{' '}
                  {String(totalPerformedSets(entries))} logged
                  {draft.isDirty ? ' · saving' : ''} ·{' '}
                </Text>
                <SessionClock session={session} />
              </View>
            </View>
            <UnitToggle
              unit={unit}
              onChange={(next) => {
                if (uid !== null) void setDisplayUnit(uid, next);
              }}
            />
          </View>

          <View style={[styles.track, { backgroundColor: palette.border }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: palette.accent,
                  width: `${String(progress.total === 0 ? 0 : (progress.completed / progress.total) * 100)}%`,
                },
              ]}
            />
          </View>

          <SessionMeta
            session={session}
            displayUnit={unit}
            onPerformedOn={(performedOn) => {
              if (uid !== null) void savePerformedOn(uid, session, performedOn);
            }}
            onBodyweight={(bodyweight) => {
              if (uid !== null) void saveBodyweight(uid, session.id, bodyweight);
            }}
            onNotes={(notes) => {
              if (uid !== null) void saveSessionNotes(uid, session.id, notes);
            }}
          />

          {entries.length === 0 ? (
            <Body dimmed>Nothing in this session yet. Add the first exercise below.</Body>
          ) : null}

          {entries.map((entry) => (
            <View
              key={keyOf(entry)}
              onLayout={(event) => {
                onRowLayout(keyOf(entry), event.nativeEvent.layout.y);
              }}
            >
              <EntryCard
                entry={entry}
                displayUnit={unit}
                workoutStats={workoutStats}
                exerciseStats={byExercise.get(entry.exerciseId) ?? null}
                workoutName={session.workoutName}
                overlayScope="same-workout"
                onNotes={onNotes}
                onRemoveEntry={entry.slotId === null ? onRemoveEntry : null}
                onWeight={onWeight}
                onAmount={onAmount}
                onMeasure={entry.prescription === null ? onMeasure : null}
                onRir={onRir}
                onToggleComplete={onToggleComplete}
                onToggleSkipped={onToggleSkipped}
                onToggleWarmup={onToggleWarmup}
                onShowExercise={onShowExercise}
                handedness={profile.handedness}
              />
            </View>
          ))}

          {/* Only for an ad-hoc session, which starts with nothing in it. A
              workout's plan is changed in the editor, not mid-set, as on the web. */}
          {session.workoutId === null && !isDone ? (
            <Button
              variant="subtle"
              label="+ Add exercise"
              onPress={() => {
                setPicking(true);
              }}
            />
          ) : null}

          {isDone ? (
            <Button
              variant="subtle"
              label="Back to history"
              onPress={() => {
                router.replace('/history');
              }}
            />
          ) : (
            <View style={styles.finish}>
              {finishError === null ? null : (
                <Text style={[styles.small, { color: palette.danger }]}>{finishError}</Text>
              )}
              <Button
                label={
                  allSetsDone
                    ? 'Finish session'
                    : `Finish session (${String(progress.total - progress.completed)} sets left)`
                }
                variant={allSetsDone ? 'filled' : 'subtle'}
                busy={finishing}
                onPress={finish}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (armedToDiscard) abandon();
                  else setArmedToDiscard(true);
                }}
                style={styles.discard}
              >
                <Text
                  style={[styles.link, { color: armedToDiscard ? palette.danger : palette.dimmed }]}
                >
                  {armedToDiscard
                    ? totalPerformedSets(entries) === 0
                      ? 'Tap again to discard it'
                      : 'Tap again to discard everything logged here'
                    : 'Discard this session'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {notice === null ? null : (
          <Pressable
            accessibilityLiveRegion="polite"
            onPress={() => {
              setNotice(null);
            }}
            style={[styles.notice, { backgroundColor: palette.offline }]}
          >
            <Text style={[styles.small, { color: palette.text }]}>{notice}</Text>
          </Pressable>
        )}

        <RestTimerBar
          rest={rest}
          withChime={profile.restChime}
          onAdjust={adjustRest}
          onStop={endRest}
          onStart={
            isDone || profile.autoStartRest || lastCompletedSet(entries) === null
              ? null
              : startRestManually
          }
        />
      </KeyboardAvoidingView>

      {/* Over the session rather than navigated to: leaving the screen mid-set
          is what made the timer hard to trust. The countdown comes along. */}
      <Sheet
        visible={detailId !== null}
        title={detail?.name ?? 'How to'}
        onClose={() => {
          setDetailId(null);
        }}
        headerAction={<RestPill rest={rest} />}
      >
        {detail === null ? (
          <Body dimmed>No instructions for this exercise.</Body>
        ) : (
          <ExerciseDetail exercise={detail} />
        )}
      </Sheet>

      <ExercisePicker
        visible={picking}
        title="Add to session"
        actionLabel="Add to session"
        onClose={() => {
          setPicking(false);
        }}
        onPick={(exercise) => {
          addExercise(exercise);
          setPicking(false);
        }}
      />

      <Modal
        visible={showingMissing}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowingMissing(false);
        }}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
            <Title>Some sets are missing numbers</Title>
            <Body dimmed>Fill these in, or skip the ones you did not do, before finishing.</Body>
            <View style={styles.group}>
              {missing.map((item) => (
                <Body key={item.first.entryKey}>
                  {item.exerciseName}: {String(item.count)} {item.count === 1 ? 'set' : 'sets'}
                </Body>
              ))}
            </View>
            <Button
              label="Show me"
              onPress={() => {
                setShowingMissing(false);
                const first = missing[0];
                const y = first === undefined ? undefined : rowY.current.get(first.first.entryKey);
                if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, y - 120) });
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={confirmingEarly}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConfirmingEarly(false);
        }}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
            <Title>Finish with sets left?</Title>
            {toComplete.length === 0 ? null : (
              <View style={styles.group}>
                <Body>Counted as done</Body>
                <Body dimmed>
                  Reps are entered for these but they were never ticked, so they are recorded as
                  performed.
                </Body>
                {toComplete.map((item) => (
                  <Body key={item.exerciseName}>
                    {item.exerciseName}: {String(item.toComplete)}{' '}
                    {item.toComplete === 1 ? 'set' : 'sets'}
                  </Body>
                ))}
              </View>
            )}
            {toSkip.length === 0 ? null : (
              <View style={styles.group}>
                <Body>Skipped</Body>
                <Body dimmed>
                  Nothing was entered for these. They stay on the session as skipped and feed no
                  history.
                </Body>
                {toSkip.map((item) => (
                  <Body key={item.exerciseName}>
                    {item.exerciseName}: {String(item.toSkip)} {item.toSkip === 1 ? 'set' : 'sets'}
                  </Body>
                ))}
              </View>
            )}
            <Button
              label={toSkip.length === 0 ? 'Tick them and finish' : 'Settle them and finish'}
              onPress={finishEarly}
            />
            <Button
              variant="subtle"
              label="Keep logging"
              onPress={() => {
                setConfirmingEarly(false);
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/** lb / kg. Changes what is shown and what a new load is entered in, never a stored set. */
function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (unit: Unit) => void }) {
  const palette = usePalette();
  return (
    <View
      style={[styles.toggle, { borderColor: palette.border }]}
      accessibilityLabel="Display unit"
    >
      {(['lb', 'kg'] as const).map((option) => {
        const selected = option === unit;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) onChange(option);
            }}
            style={[styles.toggleOption, selected && { backgroundColor: palette.accent }]}
          >
            <Text
              style={[styles.toggleLabel, { color: selected ? palette.onAccent : palette.dimmed }]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerText: { flex: 1, gap: 2 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  badges: { flexDirection: 'row', gap: 6 },
  small: { fontSize: 12 },
  link: { fontSize: 15, fontWeight: '600' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  finish: { gap: 8, paddingTop: 8 },
  discard: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  notice: { paddingHorizontal: 16, paddingVertical: 10 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: { padding: 20, gap: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  group: { gap: 4 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  toggleOption: { minWidth: 44, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
});
