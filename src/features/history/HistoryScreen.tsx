import {
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MuscleMap } from '@/components/MuscleMap';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { useMuscleLookup } from '@/data/hooks/useMuscleLookup';
import { useProfile } from '@/data/hooks/useProfile';
import { useAllExerciseStats } from '@/data/hooks/useRecords';
import { useSessionHistory } from '@/data/hooks/useSessionHistory';
import type { WeekGroup } from '@/domain/history';
import {
  formatDayLabel,
  formatElapsed,
  formatSetCount,
  formatVolumeLoad,
  formatWeekLabel,
  groupByWeek,
  sessionDurationSeconds,
  sessionTotals,
} from '@/domain/history';
import type { Session } from '@/domain/sessions';
import { formatE1rm, formatSet } from '@/domain/strength';
import type { Unit } from '@/domain/types';
import type { MuscleLookup } from '@/domain/volume';
import { WEEKLY_STOPS, totalVolume } from '@/domain/volume';

/**
 * History: what you actually did, by week.
 *
 * Two tabs, because there are two questions. The timeline answers "what did I
 * do", keyed on `performedOn` so a session logged the next morning sits on the
 * night it belongs to. Records answers "what is my best", read off the tier-2
 * stats index that PR detection already maintains.
 */

type WeekProps = {
  group: WeekGroup;
  displayUnit: Unit;
  lookup: MuscleLookup;
};

function WeekSection({ group, displayUnit, lookup }: WeekProps) {
  const [showMap, setShowMap] = useState(false);

  // Only computed once the week is opened: a long timeline would otherwise do
  // this for every week on screen, and the map is the expensive part.
  const volume = useMemo(
    () => (showMap ? totalVolume(group.sessions, lookup) : null),
    [showMap, group.sessions, lookup],
  );

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Text fw={650}>{formatWeekLabel(group.weekStart)}</Text>
        <Text size="xs" c="dimmed">
          {group.totals.sessions === 1 ? '1 session' : `${String(group.totals.sessions)} sessions`}
        </Text>
      </Group>

      <Group gap={6}>
        <Badge size="sm" variant="light" color="gray">
          {formatSetCount(group.totals.sets)}
        </Badge>
        {group.totals.volumeLoadKg > 0 ? (
          <Badge size="sm" variant="light" color="gray">
            {formatVolumeLoad(group.totals.volumeLoadKg, displayUnit)}
          </Badge>
        ) : null}
        <UnstyledButton
          onClick={() => {
            setShowMap((open) => !open);
          }}
        >
          <Badge size="sm" variant="light" color="sky" style={{ cursor: 'pointer' }}>
            {showMap ? 'Hide muscles' : 'Muscles'}
          </Badge>
        </UnstyledButton>
      </Group>

      {volume === null ? null : (
        <Card withBorder padding="sm">
          <MuscleMap
            volume={volume}
            stops={WEEKLY_STOPS}
            scopeLabel="this week"
            testId="weekly-muscle-map"
          />
        </Card>
      )}

      {group.sessions.map((session) => (
        <SessionRow key={session.id} session={session} displayUnit={displayUnit} />
      ))}
    </Stack>
  );
}

function SessionRow({ session, displayUnit }: { session: Session; displayUnit: Unit }) {
  const totals = sessionTotals(session);
  const seconds = sessionDurationSeconds(session);

  return (
    <Card
      withBorder
      padding="sm"
      component={Link}
      to={`/history/session/${session.id}`}
      data-testid="history-session"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} truncate>
              {session.workoutName === '' ? 'Ad-hoc session' : session.workoutName}
            </Text>
            {session.status === 'abandoned' ? (
              <Badge size="xs" variant="light" color="gray">
                abandoned
              </Badge>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed">
            {formatDayLabel(session.performedOn)}
            {seconds === null ? '' : ` · ${formatElapsed(seconds)}`}
            {session.workoutVersion === null ? '' : ` · v${String(session.workoutVersion)}`}
          </Text>
        </Stack>
        <Stack gap={2} align="flex-end" style={{ flexShrink: 0 }}>
          <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatSetCount(totals.sets)}
          </Text>
          {totals.volumeLoadKg > 0 ? (
            <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatVolumeLoad(totals.volumeLoadKg, displayUnit)}
            </Text>
          ) : null}
        </Stack>
      </Group>
    </Card>
  );
}

function Timeline() {
  const { sessions, isPending, hasMore, loadMore } = useSessionHistory();
  const { profile } = useProfile();
  const { lookup } = useMuscleLookup();

  const weeks = useMemo(() => groupByWeek(sessions), [sessions]);

  if (isPending) return <Skeleton height={220} radius="md" />;

  if (weeks.length === 0) {
    return (
      <Card withBorder>
        <Stack gap="xs" align="flex-start">
          <Text fw={600}>Nothing logged yet</Text>
          <Text size="sm" c="dimmed">
            Finish a session and it lands here, filed under the day you did it. Weekly set counts
            and the muscle map are rolled up from sessions you actually logged, so there is nothing
            to show until there is something to show.
          </Text>
          <Button component={Link} to="/" variant="light">
            Start a session
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack gap="lg">
      {weeks.map((group) => (
        <WeekSection
          key={group.weekStart}
          group={group}
          displayUnit={profile.displayUnit}
          lookup={lookup}
        />
      ))}
      {hasMore ? (
        <Button variant="default" onClick={loadMore}>
          Load more
        </Button>
      ) : null}
    </Stack>
  );
}

function Records() {
  const { stats, isPending } = useAllExerciseStats();
  const { profile } = useProfile();
  const { resolver } = useExerciseLibrary();

  // Newest record first: the feed is "what have I just beaten", not a ranking.
  const feed = useMemo(
    () =>
      stats
        .filter((entry) => entry.bestSet !== null && entry.bestE1rm > 0)
        .sort((a, b) => (b.bestE1rmAt ?? '').localeCompare(a.bestE1rmAt ?? '')),
    [stats],
  );

  if (isPending) return <Skeleton height={180} radius="md" />;

  if (feed.length === 0) {
    return (
      <Card withBorder>
        <Text size="sm" c="dimmed">
          No records yet. A record is set when a working set beats your best estimated 1RM for that
          lift — warmups and skipped sets never count.
        </Text>
      </Card>
    );
  }

  return (
    <Stack gap="xs">
      {feed.map((entry) => {
        const name = resolver.resolve(entry.exerciseId)?.name ?? entry.exerciseId;
        const set = entry.bestSet;

        return (
          <Card
            key={entry.exerciseId}
            withBorder
            padding="sm"
            component={Link}
            to={`/history/exercise/${entry.exerciseId}`}
            data-testid="record-row"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={600} truncate>
                  {name}
                </Text>
                <Text size="xs" c="dimmed">
                  {set === null ? '—' : formatSet(set, profile.displayUnit)}
                  {entry.bestE1rmAt === null
                    ? ''
                    : ` · ${new Date(entry.bestE1rmAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}`}
                </Text>
              </Stack>
              <Badge variant="light" color="orange" style={{ flexShrink: 0 }}>
                {formatE1rm(entry.bestE1rm, profile.displayUnit)}
              </Badge>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

export default function HistoryScreen() {
  return (
    <Stack>
      <Title order={2}>History</Title>
      <Tabs defaultValue="timeline" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="timeline">Sessions</Tabs.Tab>
          <Tabs.Tab value="records">Records</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="timeline">
          <Timeline />
        </Tabs.Panel>
        <Tabs.Panel value="records">
          <Records />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
