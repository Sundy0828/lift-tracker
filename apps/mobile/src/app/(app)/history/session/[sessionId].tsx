import { useAuth } from '@lift/data/hooks/useAuth';
import { useLoadScale } from '@lift/data/hooks/useLoadScale';
import { useMuscleLookup } from '@lift/data/hooks/useMuscleLookup';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useSession } from '@lift/data/hooks/useSession';
import { useSyncState } from '@lift/data/hooks/useSyncState';
import { useWorkoutVersion } from '@lift/data/hooks/useWorkout';
import { deleteSession } from '@lift/data/mutations/sessions';
import { firestoreErrorCode } from '@lift/data/sdk/errors';
import {
  averageRestSeconds,
  formatDayLabel,
  formatElapsed,
  formatSetCount,
  formatVolumeLoad,
  sessionDurationSeconds,
  sessionTotals,
} from '@lift/domain/history';
import type { LoggedSet, Session, SessionEntry } from '@lift/domain/sessions';
import { workedSets } from '@lift/domain/sessions';
import type { LoadScale, LoadScaleOf } from '@lift/domain/strength';
import { adjustedE1rm, bestSet, describeE1rm, formatE1rm, formatSet } from '@lift/domain/strength';
import type { Unit } from '@lift/domain/types';
import { formatWeight } from '@lift/domain/units';
import { SESSION_STOPS, sessionVolume } from '@lift/domain/volume';
import type { ExerciseSlot } from '@lift/domain/workouts';
import { formatDuration, formatPrescription, formatRestSeconds } from '@lift/domain/workouts';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Section } from '../../../../components/editor/controls';
import { MuscleMap } from '../../../../components/MuscleMap';
import { Screen } from '../../../../components/Screen';
import {
  BackTitle,
  Badge,
  Body,
  Button,
  Card,
  Loading,
  Notice,
  Row,
  Small,
  goBack,
} from '../../../../components/ui';
import { usePalette } from '../../../../theme';
import { usePush } from '../../../../navigation';

/**
 * One past session, against the workout definition it was performed against:
 * the web's `SessionDetailScreen`.
 *
 * The exercises, their order and their prescriptions come from the version
 * snapshot the session recorded, never from the live workout, so editing a
 * workout never changes how an old session reads. The sets come from the
 * session itself.
 */

type Row_ = { key: string; slot: ExerciseSlot | null; entry: SessionEntry | null };

function buildRows(
  slots: readonly ExerciseSlot[] | null,
  entries: readonly SessionEntry[],
): Row_[] {
  // No snapshot: an ad-hoc session, or a workout never published. The
  // session's own entries are then the whole record.
  if (slots === null) {
    return entries.map((entry, index) => ({
      key: entry.slotId ?? `entry-${String(index)}`,
      slot: null,
      entry,
    }));
  }

  const bySlot = new Map(
    entries.filter((entry) => entry.slotId !== null).map((entry) => [entry.slotId, entry]),
  );
  const rows: Row_[] = slots.map((slot) => ({
    key: slot.slotId,
    slot,
    entry: bySlot.get(slot.slotId) ?? null,
  }));

  // Rows added mid-session belong to no slot in the snapshot. Listed after it.
  entries.forEach((entry, index) => {
    if (entry.slotId !== null && bySlot.has(entry.slotId)) return;
    rows.push({ key: `adhoc-${String(index)}`, slot: null, entry });
  });
  return rows;
}

/** One logged set, and the rest that followed it. Tap for what the e1RM means. */
function SetLine({
  set,
  displayUnit,
  scale,
}: {
  set: LoggedSet;
  displayUnit: Unit;
  /** The exercise's, so the e1RM matches its record (see `LoadScale`). */
  scale: LoadScale;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const score = adjustedE1rm(set, scale);
  const rest = set.restTakenSeconds;

  return (
    <Pressable
      disabled={score === null}
      onPress={() => {
        setOpen((current) => !current);
      }}
    >
      <View style={styles.setLine}>
        <Text style={[styles.set, { color: palette.text }]}>{formatSet(set, displayUnit)}</Text>
        <View style={styles.setMeta}>
          {set.isWarmup ? <Badge label="warmup" /> : null}
          {set.skipped ? <Badge label="skipped" /> : null}
          {rest === null || rest <= 0 ? null : (
            <Text testID="set-rest" style={[styles.small, { color: palette.dimmed }]}>
              rest {formatDuration(rest)}
            </Text>
          )}
          {score === null ? null : (
            <Text style={[styles.small, { color: palette.dimmed }]}>
              e1RM {formatE1rm(score, displayUnit)}
            </Text>
          )}
        </View>
      </View>
      {open ? <Small>{describeE1rm(set, displayUnit, scale) ?? ''}</Small> : null}
    </Pressable>
  );
}

function EntryRow({
  row,
  displayUnit,
  scaleOf,
}: {
  row: Row_;
  displayUnit: Unit;
  scaleOf: LoadScaleOf;
}) {
  const push = usePush();
  const palette = usePalette();
  const { slot, entry } = row;
  const kind = slot?.kind ?? entry?.kind ?? 'exercise';

  if (kind === 'rest') {
    const seconds = slot?.prescription.restSeconds ?? entry?.prescription?.restSeconds ?? null;
    return (
      <Text style={[styles.small, styles.center, { color: palette.dimmed }]}>
        Rest {seconds === null ? '' : formatRestSeconds(seconds)}
      </Text>
    );
  }

  const name = slot?.exerciseName ?? entry?.exerciseName ?? 'Unknown exercise';
  const exerciseId = slot?.exerciseId ?? entry?.exerciseId ?? null;
  const prescription = slot?.prescription ?? entry?.prescription ?? null;
  const sets = entry === null ? [] : entry.sets;
  const done = workedSets(sets);
  // A row with no exercise id has no entry, so no sets for the scale to score.
  const scale = exerciseId === null ? 'external' : scaleOf(exerciseId);
  const best = bestSet(sets, scale);
  // Only from rests the timer measured: a session logged with it off says
  // nothing rather than claiming a rest of zero.
  const averageRest = averageRestSeconds(sets);

  return (
    <Card testID="session-entry">
      <View style={styles.entryHead}>
        <View style={styles.grow}>
          <Pressable
            disabled={exerciseId === null}
            onPress={() => {
              if (exerciseId !== null) {
                push({ pathname: '/history/exercise/[exerciseId]', params: { exerciseId } });
              }
            }}
          >
            <Text
              numberOfLines={1}
              style={[styles.name, { color: palette.text }, exerciseId !== null && styles.linked]}
            >
              {name}
            </Text>
          </Pressable>
          {prescription === null ? null : (
            <Small>Prescribed {formatPrescription(prescription)}</Small>
          )}
        </View>
        <View style={styles.setMeta}>
          {slot === null ? <Badge tone="accent" label="added" /> : null}
          {slot !== null && slot.supersetGroup !== null ? (
            <Badge tone="accent" label="circuit" />
          ) : null}
        </View>
      </View>

      {entry === null ? (
        <Body dimmed>Not logged.</Body>
      ) : done.length === 0 ? (
        <Body dimmed>No sets recorded.</Body>
      ) : (
        <>
          <View style={styles.sets}>
            {sets.map((set) => (
              <SetLine key={set.setIndex} set={set} displayUnit={displayUnit} scale={scale} />
            ))}
          </View>
          {averageRest === null ? null : (
            <Small>Rested {formatDuration(averageRest)} between sets on average</Small>
          )}
        </>
      )}

      {best === null ? null : <Small>Best set {formatSet(best, displayUnit)}</Small>}
      {entry !== null && entry.notes !== '' ? <Small>{entry.notes}</Small> : null}
    </Card>
  );
}

/** Two taps to delete a past session, at the foot of what it will destroy. */
function DeleteCluster({ session }: { session: Session }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // Firestore's own view rather than the network's: every open listener
  // answering from cache. The delete rebuilds records from a server read, so
  // it is the server that has to be reachable.
  const { offline } = useSyncState();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { scaleOf, isPending: scalePending } = useLoadScale();

  const remove = async (): Promise<void> => {
    // The records are rescored on the way out, so not before the library is in.
    if (uid === null || scalePending) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSession(uid, session, scaleOf);
      goBack('/history');
    } catch (cause: unknown) {
      setArmed(false);
      setBusy(false);
      setError(
        firestoreErrorCode(cause) === 'unavailable'
          ? 'Could not reach the server. Deleting a session needs a connection, so records can be recalculated.'
          : cause instanceof Error
            ? cause.message
            : 'Could not delete this session.',
      );
    }
  };

  return (
    <Card testID="delete-session">
      <Body dimmed>This removes the session and recalculates any records it set.</Body>
      {offline ? (
        <Small>Offline — records can only be recalculated with a connection.</Small>
      ) : null}
      {error === null ? null : <Notice tone="danger">{error}</Notice>}
      <Row gap={8}>
        {armed ? (
          <>
            <Button
              size="compact"
              variant="danger"
              label="Delete for good"
              busy={busy || scalePending}
              onPress={() => void remove()}
            />
            <Button
              size="compact"
              variant="subtle"
              label="Keep it"
              disabled={busy}
              onPress={() => {
                setArmed(false);
              }}
            />
          </>
        ) : (
          <Button
            size="compact"
            variant="danger-subtle"
            label="Delete session"
            disabled={offline}
            onPress={() => {
              setArmed(true);
            }}
          />
        )}
      </Row>
    </Card>
  );
}

export default function SessionDetail() {
  const push = usePush();
  const palette = usePalette();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { session, isPending, notFound } = useSession(sessionId);
  const { profile } = useProfile();
  const { lookup } = useMuscleLookup();
  const { scaleOf } = useLoadScale();
  const { version, isPending: versionPending } = useWorkoutVersion(
    session?.workoutId ?? null,
    session?.workoutVersion ?? null,
  );

  if (isPending) return <Loading />;

  if (session === null) {
    return (
      <Screen>
        <BackTitle title="Session" fallback="/history" />
        <Card>
          <Body dimmed>
            {notFound ? 'This session no longer exists.' : 'Loading this session…'}
          </Body>
        </Card>
      </Screen>
    );
  }

  const displayUnit = profile.displayUnit;
  const totals = sessionTotals(session);
  const seconds = sessionDurationSeconds(session);
  // The snapshot's name: an old session reads under the name it had then.
  const title =
    version?.name ?? (session.workoutName === '' ? 'Ad-hoc session' : session.workoutName);
  const rows = buildRows(version?.slots ?? null, session.entries);
  // Sets that were done, not sets that were prescribed.
  const volume = sessionVolume(session.entries, lookup);

  return (
    <Screen>
      <View style={styles.head}>
        <BackTitle title={title} fallback="/history" />
        <Text style={[styles.body, { color: palette.dimmed }]}>
          {formatDayLabel(session.performedOn)}
          {seconds === null ? '' : ` · ${formatElapsed(seconds)}`}
        </Text>
      </View>

      <Row>
        <Badge label={formatSetCount(totals.sets)} />
        {totals.volumeLoadKg > 0 ? (
          <Badge label={formatVolumeLoad(totals.volumeLoadKg, displayUnit)} />
        ) : null}
        {totals.restSeconds === 0 ? null : (
          <Badge testID="session-rest" label={`${formatElapsed(totals.restSeconds)} resting`} />
        )}
        {session.bodyweight === null ? null : (
          <Badge label={`BW ${formatWeight(session.bodyweight, displayUnit)}`} />
        )}
        {session.status === 'abandoned' ? <Badge label="abandoned" /> : null}
      </Row>
      {totals.averageRestSeconds === null ? null : (
        <Small>Averaging {formatDuration(totals.averageRestSeconds)} between sets.</Small>
      )}

      {session.notes === '' ? null : (
        <Card>
          <Body>{session.notes}</Body>
        </Card>
      )}

      {versionPending ? null : version === null ? (
        session.workoutId === null ? null : (
          <Notice tone="gray" title="No saved definition">
            {`This session records version ${String(session.workoutVersion ?? '—')} of the workout, but that snapshot is not available. What is shown below is what the session itself recorded, which is still exactly what you did.`}
          </Notice>
        )
      ) : (
        <Notice tone="accent" title={`As it was at v${String(version.versionNumber)}`}>
          <Body>
            The exercises and prescriptions below are the snapshot this session was performed
            against. Editing the workout since has not changed them.
          </Body>
          {version.changeSummary === '' ? null : (
            <Small>That version: {version.changeSummary}</Small>
          )}
          {session.workoutId === null ? null : (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                if (session.workoutId !== null) {
                  push({
                    pathname: '/workout/[workoutId]',
                    params: { workoutId: session.workoutId },
                  });
                }
              }}
            >
              <Text style={[styles.small, styles.underline, { color: palette.dimmed }]}>
                Open the workout as it is now
              </Text>
            </Pressable>
          )}
        </Notice>
      )}

      <View style={styles.entries}>
        {rows.map((row) => (
          <EntryRow key={row.key} row={row} displayUnit={displayUnit} scaleOf={scaleOf} />
        ))}
      </View>

      {volume.size === 0 ? null : (
        <Section title="Muscle map" initiallyOpen>
          <MuscleMap
            volume={volume}
            stops={SESSION_STOPS}
            scopeLabel="this session"
            basis="logged"
          />
        </Section>
      )}

      {session.status === 'active' ? null : <DeleteCluster session={session} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  body: { fontSize: 14 },
  small: { fontSize: 12 },
  center: { textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
  entries: { gap: 8 },
  entryHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  grow: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  linked: { textDecorationLine: 'underline' },
  sets: { gap: 4 },
  setLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  set: { fontSize: 14, fontVariant: ['tabular-nums'] },
  setMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
