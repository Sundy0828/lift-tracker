import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { useExerciseSessions } from '@lift/data/hooks/useExerciseSessions';
import { useProfile } from '@lift/data/hooks/useProfile';
import type { ExercisePerformance } from '@lift/domain/history';
import {
  exercisePerformances,
  filterByWorkout,
  formatDayLabel,
  formatSetCount,
  recordMilestones,
  workoutFilterOptions,
} from '@lift/domain/history';
import { formatE1rm, formatSet } from '@lift/domain/strength';
import type { TrendSample } from '@lift/domain/trend';
import type { Unit } from '@lift/domain/types';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '../../../../components/editor/controls';
import { useOpenSession } from '../../../../components/history/SessionRow';
import { Screen } from '../../../../components/Screen';
import { TrendLine } from '../../../../components/TrendLine';
import { BackTitle, Badge, Body, Card, Heading, Notice, Small } from '../../../../components/ui';
import { usePalette } from '../../../../theme';

/**
 * One lift over time: the trend line, the records, and every performance. The
 * web's `ExerciseHistoryScreen`.
 *
 * **The workout filter is the point.** Bench on PUSH and bench on CHEST +
 * DELTS are done fresh and fatigued respectively, so one line through both is
 * a line through two different exercises. All days is offered; scoping to
 * one workout is the comparison that means something.
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
  const openSession = useOpenSession();
  const palette = usePalette();
  return (
    <Card
      testID="performance-row"
      onPress={() => {
        openSession(performance.sessionId);
      }}
    >
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text style={[styles.strong, { color: palette.text }]}>
            {formatDayLabel(performance.performedOn)}
          </Text>
          <Small numberOfLines={1}>
            {performance.workoutId === null ? 'Ad-hoc' : performance.workoutName}
            {performance.workoutVersion === null ? '' : ` · v${String(performance.workoutVersion)}`}
          </Small>
        </View>
        <View style={styles.meta}>
          {isRecord ? <Badge tone="orange" label="PR" /> : null}
          {performance.e1rmKg === null ? null : (
            <Text style={[styles.small, { color: palette.dimmed }]}>
              e1RM {formatE1rm(performance.e1rmKg, displayUnit)}
            </Text>
          )}
        </View>
      </View>
      <Text style={[styles.sets, { color: palette.text }]}>
        {performance.sets
          .map((set) => formatSet(set, displayUnit, { withUnit: false }))
          .join('  ·  ')}
      </Text>
      <Small>
        {formatSetCount(performance.sets.length)} · {displayUnit}
      </Small>
    </Card>
  );
}

export default function ExerciseHistory() {
  const palette = usePalette();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const id = exerciseId;
  const { sessions, isPending, isTruncated, error } = useExerciseSessions(id);
  const { resolver } = useExerciseLibrary();
  const { profile } = useProfile();
  const [scope, setScope] = useState<string>(ALL);

  const all = useMemo(() => exercisePerformances(sessions, id), [sessions, id]);
  const options = useMemo(() => workoutFilterOptions(all), [all]);

  const performances = useMemo(() => {
    if (scope === ALL) return [...all];
    if (scope === AD_HOC) return all.filter((one) => one.workoutId === null);
    return filterByWorkout(all, scope);
  }, [all, scope]);

  const milestones = useMemo(() => recordMilestones(performances), [performances]);

  // Samples and record markers are indexed together, so the filled dots on
  // the line are the same events as the rows in the record list.
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

  const name = resolver.resolve(id)?.name ?? id;
  const displayUnit = profile.displayUnit;

  return (
    <Screen>
      <View style={styles.head}>
        <BackTitle title={name} fallback="/history" />
        {/* Said in full: this is the one screen whose every number is an estimate. */}
        <Body dimmed>
          Estimated 1RM — what one rep would have been, worked back from the set you did, with reps
          in reserve counted as reps you had left. Nobody lifted these numbers.
        </Body>
      </View>

      {error !== null ? (
        <Notice tone="danger" title="Could not load this history">
          {error}
        </Notice>
      ) : isPending ? (
        <ActivityIndicator color={palette.accent} style={styles.spinner} />
      ) : all.length === 0 ? (
        <Card>
          <Body dimmed>
            No logged performances yet. Sets appear here once a session containing this exercise is
            finished.
          </Body>
        </Card>
      ) : (
        <>
          {options.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              accessibilityLabel="Show"
            >
              <Chip
                label={`All days (${String(all.length)})`}
                selected={scope === ALL}
                onPress={() => {
                  setScope(ALL);
                }}
              />
              {options.map((option) => {
                const value = option.workoutId ?? AD_HOC;
                return (
                  <Chip
                    key={value}
                    label={`${option.workoutId === null ? 'Ad-hoc' : option.workoutName} (${String(option.count)})`}
                    selected={scope === value}
                    onPress={() => {
                      setScope(value);
                    }}
                  />
                );
              })}
            </ScrollView>
          ) : null}

          {samples.length === 0 ? (
            <Card>
              <Body dimmed>
                Nothing here can be scored yet — an estimated 1RM needs both a load and a rep count.
              </Body>
            </Card>
          ) : (
            <Card>
              <TrendLine
                samples={samples}
                records={recordIndices}
                formatValue={(value) => formatE1rm(value, displayUnit)}
              />
            </Card>
          )}

          {milestones.length === 0 ? null : (
            <View style={styles.list}>
              <Heading>Records</Heading>
              {milestones.map((milestone) => (
                <Card key={milestone.performance.sessionId}>
                  <View style={styles.row}>
                    <View style={styles.grow}>
                      <Text style={[styles.sets, { color: palette.text }]}>
                        {formatSet(milestone.set, displayUnit)}
                      </Text>
                      <Small numberOfLines={1}>
                        {formatDayLabel(milestone.performance.performedOn)}
                        {milestone.performance.workoutId === null
                          ? ' · Ad-hoc'
                          : ` · ${milestone.performance.workoutName}`}
                      </Small>
                    </View>
                    <Badge
                      tone="orange"
                      label={`e1RM ${formatE1rm(milestone.e1rmKg, displayUnit)}`}
                    />
                  </View>
                </Card>
              ))}
            </View>
          )}

          <View style={styles.list}>
            <Heading>Every performance</Heading>
            {[...performances].reverse().map((performance) => (
              <PerformanceCard
                key={performance.sessionId}
                performance={performance}
                displayUnit={displayUnit}
                isRecord={recordSessions.has(performance.sessionId)}
              />
            ))}
            {isTruncated ? <Small>Showing the most recent performances only.</Small> : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  spinner: { paddingVertical: 32 },
  chips: { gap: 8, alignItems: 'center', paddingRight: 16 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  grow: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strong: { fontSize: 14, fontWeight: '600' },
  sets: { fontSize: 14, fontVariant: ['tabular-nums'] },
  small: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
