import { Alert, Badge, Card, Group, Select, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { TrendLine } from '@/components/TrendLine';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { useExerciseSessions } from '@/data/hooks/useExerciseSessions';
import { useProfile } from '@/data/hooks/useProfile';
import type { ExercisePerformance } from '@/domain/history';
import {
  exercisePerformances,
  filterByWorkout,
  formatDayLabel,
  formatSetCount,
  recordMilestones,
  workoutFilterOptions,
} from '@/domain/history';
import type { TrendSample } from '@/domain/trend';
import { formatE1rm, formatSet } from '@/domain/strength';
import type { Unit } from '@/domain/types';

/**
 * One lift, over time: the trend line, the records, and every performance.
 *
 * Reached by tapping through from a session or a record — never from the
 * logging screen, because this is the one view that queries `sessions`
 * directly and §2.6 keeps historical queries off the log screen's critical
 * path entirely.
 *
 * **The workout filter is the point.** Bench on PUSH and bench on CHEST +
 * DELTS are done fresh and fatigued respectively, so a single line through
 * both is a line through two different exercises. `All days` is offered, and
 * is honest as long as you know what it is; scoping to one workout is the
 * comparison that means something.
 */

const ALL = '__all__';
const AD_HOC = '__adhoc__';

function PerformanceCard({
  performance,
  displayUnit,
  isRecord,
}: {
  performance: ExercisePerformance;
  displayUnit: Unit;
  isRecord: boolean;
}) {
  return (
    <Card
      withBorder
      padding="sm"
      component={Link}
      to={`/history/session/${performance.sessionId}`}
      data-testid="performance-row"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="sm" fw={600}>
              {formatDayLabel(performance.performedOn)}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {performance.workoutId === null ? 'Ad-hoc' : performance.workoutName}
              {performance.workoutVersion === null
                ? ''
                : ` · v${String(performance.workoutVersion)}`}
            </Text>
          </Stack>
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            {isRecord ? (
              <Badge size="xs" variant="light" color="orange">
                PR
              </Badge>
            ) : null}
            {performance.e1rmKg === null ? null : (
              <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatE1rm(performance.e1rmKg, displayUnit)}
              </Text>
            )}
          </Group>
        </Group>
        <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {performance.sets
            .map((set) => formatSet(set, displayUnit, { withUnit: false }))
            .join('  ·  ')}
        </Text>
        <Text size="xs" c="dimmed">
          {formatSetCount(performance.sets.length)} · {displayUnit}
        </Text>
      </Stack>
    </Card>
  );
}

export default function ExerciseHistoryScreen() {
  const { exerciseId } = useParams();
  const id = exerciseId ?? null;
  const { sessions, isPending, isTruncated, error } = useExerciseSessions(id);
  const { resolver } = useExerciseLibrary();
  const { profile } = useProfile();
  const [scope, setScope] = useState<string>(ALL);

  const all = useMemo(
    () => (id === null ? [] : exercisePerformances(sessions, id)),
    [sessions, id],
  );
  const options = useMemo(() => workoutFilterOptions(all), [all]);

  const workoutId = scope === ALL || scope === AD_HOC ? null : scope;
  const performances = useMemo(() => {
    if (scope === ALL) return [...all];
    if (scope === AD_HOC) return all.filter((one) => one.workoutId === null);
    return filterByWorkout(all, workoutId);
  }, [all, scope, workoutId]);

  const milestones = useMemo(() => recordMilestones(performances), [performances]);

  // Samples and the record markers are indexed together, so the filled dots on
  // the line are the same events as the rows in the PR list.
  const { samples, recordIndices, recordSessions } = useMemo(() => {
    const scored = performances.filter((one) => one.e1rmKg !== null);
    const indexBySession = new Map(scored.map((one, index) => [one.sessionId, index]));
    const sessionIds = new Set(milestones.map((one) => one.performance.sessionId));

    return {
      samples: scored.map<TrendSample>((one) => ({
        dateKey: one.performedOn,
        value: one.e1rmKg ?? 0,
      })),
      recordIndices: new Set(
        [...sessionIds].flatMap((sessionId) => {
          const index = indexBySession.get(sessionId);
          return index === undefined ? [] : [index];
        }),
      ),
      recordSessions: sessionIds,
    };
  }, [performances, milestones]);

  const name = id === null ? 'Exercise' : (resolver.resolve(id)?.name ?? id);
  const displayUnit = profile.displayUnit;

  const selectData = [
    { value: ALL, label: `All days (${String(all.length)})` },
    ...options.map((option) => ({
      value: option.workoutId ?? AD_HOC,
      label: `${option.workoutId === null ? 'Ad-hoc' : option.workoutName} (${String(option.count)})`,
    })),
  ];

  return (
    <Stack>
      <Stack gap={2}>
        <Title order={2}>{name}</Title>
        <Text size="sm" c="dimmed">
          Estimated 1RM, adjusted for reps in reserve.
        </Text>
      </Stack>

      {error !== null ? (
        <Alert variant="light" color="red" title="Could not load this history">
          <Text size="sm">{error}</Text>
        </Alert>
      ) : isPending ? (
        <Skeleton height={240} radius="md" />
      ) : all.length === 0 ? (
        <Card withBorder>
          <Text size="sm" c="dimmed">
            No logged performances yet. Sets appear here once a session containing this exercise is
            finished.
          </Text>
        </Card>
      ) : (
        <>
          {options.length > 1 ? (
            <Select
              label="Show"
              data={selectData}
              value={scope}
              allowDeselect={false}
              onChange={(value) => {
                setScope(value ?? ALL);
              }}
            />
          ) : null}

          {samples.length === 0 ? (
            <Card withBorder>
              <Text size="sm" c="dimmed">
                Nothing here can be scored yet — an estimated 1RM needs both a load and a rep count.
              </Text>
            </Card>
          ) : (
            <Card withBorder padding="sm">
              <TrendLine
                samples={samples}
                records={recordIndices}
                formatValue={(value) => formatE1rm(value, displayUnit)}
              />
            </Card>
          )}

          {milestones.length === 0 ? null : (
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Records
              </Text>
              {milestones.map((milestone) => (
                <Card key={milestone.performance.sessionId} withBorder padding="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatSet(milestone.set, displayUnit)}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {formatDayLabel(milestone.performance.performedOn)}
                        {milestone.performance.workoutId === null
                          ? ' · Ad-hoc'
                          : ` · ${milestone.performance.workoutName}`}
                      </Text>
                    </Stack>
                    <Badge variant="light" color="orange" style={{ flexShrink: 0 }}>
                      {formatE1rm(milestone.e1rmKg, displayUnit)}
                    </Badge>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}

          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Every performance
            </Text>
            {[...performances].reverse().map((performance) => (
              <PerformanceCard
                key={performance.sessionId}
                performance={performance}
                displayUnit={displayUnit}
                isRecord={recordSessions.has(performance.sessionId)}
              />
            ))}
            {isTruncated ? (
              <Text size="xs" c="dimmed">
                Showing the most recent performances only.
              </Text>
            ) : null}
          </Stack>
        </>
      )}
    </Stack>
  );
}
