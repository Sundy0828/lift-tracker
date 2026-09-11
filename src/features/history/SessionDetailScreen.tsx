import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MuscleMap } from '@/components/MuscleMap';
import { useOnline } from '@/app/useOnline';
import { useAuth } from '@/data/hooks/useAuth';
import { useMuscleLookup } from '@/data/hooks/useMuscleLookup';
import { useProfile } from '@/data/hooks/useProfile';
import { useSession } from '@/data/hooks/useSession';
import { useWorkoutVersion } from '@/data/hooks/useWorkout';
import { deleteSession } from '@/data/mutations/sessions';
import {
  formatDayLabel,
  formatElapsed,
  formatSetCount,
  formatVolumeLoad,
  sessionDurationSeconds,
  sessionTotals,
} from '@/domain/history';
import type { LoggedSet, Session, SessionEntry } from '@/domain/sessions';
import { workedSets } from '@/domain/sessions';
import { adjustedE1rm, bestSet, formatE1rm, formatSet } from '@/domain/strength';
import type { Unit } from '@/domain/types';
import { formatWeight } from '@/domain/units';
import { SESSION_STOPS, sessionVolume } from '@/domain/volume';
import type { ExerciseSlot } from '@/domain/workouts';
import { formatPrescription, formatRestSeconds } from '@/domain/workouts';

/**
 * One past session, rendered against the workout definition it was actually
 * performed against — the archaeology view.
 *
 * The exercises, their order and their prescriptions all come from
 * `workouts/{id}/versions/{n}`, the immutable snapshot the session recorded,
 * and never from the live workout (§2.5). That is the whole mechanism behind
 * "edit PUSH twice and week 1 still reads correctly": edit the workout as much
 * as you like, this screen keeps showing what you were told to do that day and
 * what you did about it.
 *
 * The logged sets come from the session document, which also carries its own
 * copy of each prescription. Where the two disagree — a workout edited while a
 * session was open — the snapshot is shown as the prescription and the session
 * is shown as the performance, which is what each one honestly is.
 */

type Row = {
  key: string;
  slot: ExerciseSlot | null;
  entry: SessionEntry | null;
};

function buildRows(slots: readonly ExerciseSlot[] | null, entries: readonly SessionEntry[]): Row[] {
  // No snapshot — an ad-hoc session, or one logged against a workout that was
  // never published. The session's own entries are then the only record there
  // is, and they are a complete one.
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

  const rows: Row[] = slots.map((slot) => ({
    key: slot.slotId,
    slot,
    entry: bySlot.get(slot.slotId) ?? null,
  }));

  // Rows added mid-session belong to no slot in the snapshot. They are real
  // work and are listed after it, labelled for what they are.
  entries.forEach((entry, index) => {
    if (entry.slotId !== null && bySlot.has(entry.slotId)) return;
    rows.push({ key: `adhoc-${String(index)}`, slot: null, entry });
  });

  return rows;
}

function SetLine({ set, displayUnit }: { set: LoggedSet; displayUnit: Unit }) {
  const score = adjustedE1rm(set);

  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatSet(set, displayUnit)}
      </Text>
      <Group gap={6} wrap="nowrap">
        {set.isWarmup ? (
          <Badge size="xs" variant="light" color="gray">
            warmup
          </Badge>
        ) : null}
        {set.skipped ? (
          <Badge size="xs" variant="light" color="gray">
            skipped
          </Badge>
        ) : null}
        {score === null ? null : (
          <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatE1rm(score, displayUnit)}
          </Text>
        )}
      </Group>
    </Group>
  );
}

function EntryRow({ row, displayUnit }: { row: Row; displayUnit: Unit }) {
  const { slot, entry } = row;
  const kind = slot?.kind ?? entry?.kind ?? 'exercise';

  if (kind === 'rest') {
    const seconds = slot?.prescription.restSeconds ?? entry?.prescription?.restSeconds ?? null;
    return (
      <Text size="xs" c="dimmed" ta="center">
        Rest {seconds === null ? '' : formatRestSeconds(seconds)}
      </Text>
    );
  }

  const name = slot?.exerciseName ?? entry?.exerciseName ?? 'Unknown exercise';
  const exerciseId = slot?.exerciseId ?? entry?.exerciseId ?? null;
  const prescription = slot?.prescription ?? entry?.prescription ?? null;
  const sets = entry === null ? [] : entry.sets;
  const done = workedSets(sets);
  const best = bestSet(sets);

  return (
    <Card withBorder padding="sm" data-testid="session-entry">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2} style={{ minWidth: 0 }}>
            {exerciseId === null ? (
              <Text fw={600} truncate>
                {name}
              </Text>
            ) : (
              <Text
                component={Link}
                to={`/history/exercise/${exerciseId}`}
                fw={600}
                truncate
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {name}
              </Text>
            )}
            {prescription === null ? null : (
              <Text size="xs" c="dimmed">
                Prescribed {formatPrescription(prescription)}
              </Text>
            )}
          </Stack>
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            {slot === null ? (
              <Badge size="xs" variant="light" color="sky">
                added
              </Badge>
            ) : null}
            {slot?.supersetGroup === null || slot === null ? null : (
              <Badge size="xs" variant="light" color="grape">
                circuit
              </Badge>
            )}
          </Group>
        </Group>

        {entry === null ? (
          <Text size="sm" c="dimmed">
            Not logged.
          </Text>
        ) : done.length === 0 ? (
          <Text size="sm" c="dimmed">
            No sets recorded.
          </Text>
        ) : (
          <Stack gap={2}>
            {sets.map((set) => (
              <SetLine key={set.setIndex} set={set} displayUnit={displayUnit} />
            ))}
          </Stack>
        )}

        {best === null ? null : (
          <Text size="xs" c="dimmed">
            Best set {formatSet(best, displayUnit)}
          </Text>
        )}

        {entry !== null && entry.notes !== '' ? (
          <Text size="xs" c="dimmed">
            {entry.notes}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

/** Two taps to delete a past session, at the foot of what it will destroy. */
function DeleteCluster({ session }: { session: Session }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const online = useOnline();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async (): Promise<void> => {
    if (uid === null) return;
    setBusy(true);
    try {
      await deleteSession(uid, session);
      notifications.show({ message: 'Session deleted', color: 'gray' });
      void navigate('/history');
    } catch (cause: unknown) {
      setArmed(false);
      notifications.show({
        message: cause instanceof Error ? cause.message : 'Could not delete this session.',
        color: 'red',
        autoClose: false,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card withBorder padding="sm" data-testid="delete-session">
      <Stack gap="xs" align="flex-start">
        <Text size="sm" c="dimmed">
          This removes the session and recalculates any records it set.
        </Text>
        {online ? null : (
          <Text size="xs" c="dimmed">
            Offline — records can only be recalculated with a connection.
          </Text>
        )}
        <Group gap="xs" wrap="wrap">
          {armed ? (
            <>
              <Button
                size="compact-sm"
                color="red"
                loading={busy}
                onClick={() => {
                  void remove();
                }}
              >
                Delete for good
              </Button>
              <Button
                size="compact-sm"
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  setArmed(false);
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
              disabled={!online}
              onClick={() => {
                setArmed(true);
              }}
            >
              Delete session
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

export default function SessionDetailScreen() {
  const { sessionId } = useParams();
  const { session, isPending, notFound } = useSession(sessionId ?? null);
  const { profile } = useProfile();
  const { lookup } = useMuscleLookup();
  const { version, isPending: versionPending } = useWorkoutVersion(
    session?.workoutId ?? null,
    session?.workoutVersion ?? null,
  );

  if (isPending) return <Skeleton height={280} radius="md" />;

  if (session === null) {
    return (
      <Stack>
        <Title order={2}>Session</Title>
        <Card withBorder>
          <Text size="sm" c="dimmed">
            {notFound ? 'This session no longer exists.' : 'Loading this session…'}
          </Text>
        </Card>
      </Stack>
    );
  }

  const displayUnit = profile.displayUnit;
  const totals = sessionTotals(session);
  const seconds = sessionDurationSeconds(session);
  // The snapshot's name, not the workout's: an old session must read under the
  // name the workout had at the time.
  const title =
    version?.name ?? (session.workoutName === '' ? 'Ad-hoc session' : session.workoutName);
  const rows = buildRows(version?.slots ?? null, session.entries);
  // Sets that were done, not sets that were prescribed.
  const volume = sessionVolume(session.entries, lookup);

  return (
    <Stack>
      <Stack gap={2}>
        <Title order={2}>{title}</Title>
        <Text size="sm" c="dimmed">
          {formatDayLabel(session.performedOn)}
          {seconds === null ? '' : ` · ${formatElapsed(seconds)}`}
        </Text>
      </Stack>

      <Group gap={6}>
        <Badge variant="light" color="gray">
          {formatSetCount(totals.sets)}
        </Badge>
        {totals.volumeLoadKg > 0 ? (
          <Badge variant="light" color="gray">
            {formatVolumeLoad(totals.volumeLoadKg, displayUnit)}
          </Badge>
        ) : null}
        {session.bodyweight === null ? null : (
          <Badge variant="light" color="gray">
            BW {formatWeight(session.bodyweight, displayUnit)}
          </Badge>
        )}
        {session.status === 'abandoned' ? (
          <Badge variant="light" color="gray">
            abandoned
          </Badge>
        ) : null}
      </Group>

      {session.notes === '' ? null : (
        <Card withBorder padding="sm">
          <Text size="sm">{session.notes}</Text>
        </Card>
      )}

      {versionPending ? (
        <Skeleton height={64} radius="md" />
      ) : version === null ? (
        session.workoutId === null ? null : (
          <Alert variant="light" color="gray" title="No saved definition">
            <Text size="sm">
              This session records version {session.workoutVersion ?? '—'} of the workout, but that
              snapshot is not available. What is shown below is what the session itself recorded,
              which is still exactly what you did.
            </Text>
          </Alert>
        )
      ) : (
        <Alert variant="light" color="sky" title={`As it was at v${String(version.versionNumber)}`}>
          <Stack gap={4}>
            <Text size="sm">
              The exercises and prescriptions below are the snapshot this session was performed
              against. Editing the workout since has not changed them.
            </Text>
            {version.changeSummary === '' ? null : (
              <Text size="xs" c="dimmed">
                That version: {version.changeSummary}
              </Text>
            )}
            {session.workoutId === null ? null : (
              <Text
                component={Link}
                to={`/workouts/${session.workoutId}`}
                size="xs"
                c="dimmed"
                style={{ textDecoration: 'underline' }}
              >
                Open the workout as it is now
              </Text>
            )}
          </Stack>
        </Alert>
      )}

      <Stack gap="xs">
        {rows.map((row) => (
          <EntryRow key={row.key} row={row} displayUnit={displayUnit} />
        ))}
      </Stack>

      {volume.size === 0 ? null : (
        <Accordion variant="separated" defaultValue="muscles">
          <Accordion.Item value="muscles">
            <Accordion.Control>Muscle map</Accordion.Control>
            <Accordion.Panel>
              <MuscleMap
                volume={volume}
                stops={SESSION_STOPS}
                scopeLabel="this session"
                testId="session-muscle-map"
              />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {session.status === 'active' ? null : <DeleteCluster session={session} />}
    </Stack>
  );
}
