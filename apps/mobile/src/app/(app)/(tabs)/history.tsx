import { useAuth } from '@lift/data/hooks/useAuth';
import { useDayIndex } from '@lift/data/hooks/useDayIndex';
import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { useMuscleLookup } from '@lift/data/hooks/useMuscleLookup';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useAllExerciseStats } from '@lift/data/hooks/useRecords';
import { useSessionHistory, useSessionsOn } from '@lift/data/hooks/useSessionHistory';
import { rebuildDayIndex } from '@lift/data/mutations/dayIndex';
import type { ActivityByDay, PeriodTotals } from '@lift/domain/calendar';
import {
  activityByDay,
  firstTrainedDay,
  formatMonthLabel,
  monthEnd,
  monthKeyOf,
  monthStart,
  periodTotals,
  shiftMonth,
  weekStreak,
  yearEnd,
  yearStart,
} from '@lift/domain/calendar';
import { DAY_INDEX_VERSION } from '@lift/domain/dayIndex';
import {
  formatDateWithYear,
  formatDayLabel,
  formatElapsed,
  formatSetCount,
  formatVolumeLoad,
  formatWeekLabel,
  groupByMonth,
  groupByWeek,
  weekEndOf,
  weekStartOf,
} from '@lift/domain/history';
import type { Session } from '@lift/domain/sessions';
import { localDateKey } from '@lift/domain/sessions';
import { describeE1rm, formatE1rm, formatSet, loadScaleFor } from '@lift/domain/strength';
import type { Unit } from '@lift/domain/types';
import type { MuscleLookup } from '@lift/domain/volume';
import { WEEKLY_STOPS, totalVolume } from '@lift/domain/volume';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarLegend,
  MonthCalendar,
  YearCalendar,
} from '../../../components/history/ActivityCalendar';
import { SessionRow } from '../../../components/history/SessionRow';
import { MuscleMap } from '../../../components/MuscleMap';
import { Screen } from '../../../components/Screen';
import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  Loading,
  Row,
  Segmented,
  Small,
  Title,
} from '../../../components/ui';
import { usePalette } from '../../../theme';
import { usePush } from '../../../navigation';

/**
 * History: what you actually did. The web's `HistoryScreen`, tab for tab.
 *
 * **Sessions** answers "what did I do", grouped by the day it belongs to
 * (`performedOn`). **Calendar** answers "how often", from the day index (a
 * small document per year) rather than from the sessions. **Records** answers
 * "what is my best", from the stats index PR detection already keeps.
 *
 * The sessions page in forty at a time, and the next page loads as the end of
 * the list comes near.
 */

type Tab = 'timeline' | 'calendar' | 'records';

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'timeline', label: 'Sessions' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'records', label: 'Records' },
];

export default function History() {
  const [tab, setTab] = useState<Tab>('timeline');
  /** The timeline's "load the next page", while it is the tab on screen. */
  const [nearEnd, setNearEnd] = useState<(() => void) | null>(null);

  return (
    <Screen
      onNearEnd={() => {
        nearEnd?.();
      }}
    >
      <Title>History</Title>
      <Segmented label="History view" options={TABS} value={tab} onChange={setTab} />
      {/* Unmounted when hidden, so the calendar's reads only run on its tab. */}
      {tab === 'timeline' ? <Timeline onNearEnd={setNearEnd} /> : null}
      {tab === 'calendar' ? <CalendarPanel /> : null}
      {tab === 'records' ? <Records /> : null}
    </Screen>
  );
}

type SectionProps = {
  label: string;
  sessions: Session[];
  totals: { sessions: number; sets: number; volumeLoadKg: number; restSeconds: number };
  displayUnit: Unit;
  lookup: MuscleLookup;
};

function Section({ label, sessions, totals, displayUnit, lookup }: SectionProps) {
  const palette = usePalette();
  const [showMap, setShowMap] = useState(false);

  // Only once opened: the map is the expensive part, and a long timeline
  // would otherwise work one out for every group on screen.
  const volume = useMemo(
    () => (showMap ? totalVolume(sessions, lookup) : null),
    [showMap, sessions, lookup],
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Heading>{label}</Heading>
        <Small>{totals.sessions === 1 ? '1 session' : `${String(totals.sessions)} sessions`}</Small>
      </View>

      <Row>
        <Badge label={formatSetCount(totals.sets)} />
        {totals.volumeLoadKg > 0 ? (
          <Badge label={formatVolumeLoad(totals.volumeLoadKg, displayUnit)} />
        ) : null}
        {totals.restSeconds === 0 ? null : (
          <Badge label={`${formatElapsed(totals.restSeconds)} resting`} />
        )}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            setShowMap((open) => !open);
          }}
        >
          <Badge tone="accent" label={showMap ? 'Hide muscles' : 'Muscles'} />
        </Pressable>
      </Row>

      {volume === null ? null : (
        <View style={[styles.mapCard, { borderColor: palette.border }]}>
          <MuscleMap
            volume={volume}
            stops={WEEKLY_STOPS}
            scopeLabel={label.toLowerCase()}
            basis="logged"
          />
        </View>
      )}

      {sessions.map((session) => (
        <SessionRow key={session.id} session={session} displayUnit={displayUnit} />
      ))}
    </View>
  );
}

function EmptyHistory() {
  return (
    <Card>
      <Heading>Nothing logged yet</Heading>
      <Body dimmed>
        Finish a session and it lands here, filed under the day you did it. Weekly set counts and
        the muscle map are rolled up from sessions you actually logged, so there is nothing to show
        until there is something to show.
      </Body>
      <Button
        variant="subtle"
        label="Start a session"
        onPress={() => {
          router.navigate('/');
        }}
      />
    </Card>
  );
}

/** How the session list is grouped. A year of weeks is fifty-two headings. */
type Grouping = 'week' | 'month';

function Timeline({
  onNearEnd,
}: {
  /** Hands the screen this list's "load more", or null once it is gone. */
  onNearEnd: (loadNext: (() => void) | null) => void;
}) {
  const palette = usePalette();
  const { sessions, isPending, hasMore, loadMore } = useSessionHistory();
  const { profile } = useProfile();
  const { lookup } = useMuscleLookup();
  const [grouping, setGrouping] = useState<Grouping>('week');

  const weeks = useMemo(() => groupByWeek(sessions), [sessions]);
  const months = useMemo(() => groupByMonth(sessions), [sessions]);

  /**
   * Armed on the count it last asked at, so one approach to the end asks
   * once. Scroll events keep firing while the page is in flight, and asking
   * on each would skip straight past it.
   */
  const asked = useRef(-1);
  useEffect(() => {
    const count = sessions.length;
    // Wrapped, because a function handed to a state setter is called as an updater.
    onNearEnd(() => () => {
      if (!hasMore || asked.current === count) return;
      asked.current = count;
      loadMore();
    });
    return () => {
      onNearEnd(null);
    };
  }, [onNearEnd, hasMore, loadMore, sessions.length]);

  if (isPending) return <ActivityIndicator color={palette.accent} style={styles.spinner} />;
  if (weeks.length === 0) return <EmptyHistory />;

  return (
    <View style={styles.timeline}>
      <Segmented
        label="Group sessions by"
        options={[
          { value: 'week', label: 'By week' },
          { value: 'month', label: 'By month' },
        ]}
        value={grouping}
        onChange={setGrouping}
      />

      {grouping === 'week'
        ? weeks.map((group) => (
            <Section
              key={group.weekStart}
              label={formatWeekLabel(group.weekStart)}
              sessions={group.sessions}
              totals={group.totals}
              displayUnit={profile.displayUnit}
              lookup={lookup}
            />
          ))
        : months.map((group) => (
            <Section
              key={group.monthKey}
              label={formatMonthLabel(group.monthKey)}
              sessions={group.sessions}
              totals={group.totals}
              displayUnit={profile.displayUnit}
              lookup={lookup}
            />
          ))}

      {hasMore ? (
        <View style={styles.loadingMore}>
          <ActivityIndicator color={palette.accent} />
          <Small>Loading more</Small>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One period's headline: how long, and on how many days. No tonnage and no
 * set count, as on the web: summed over a month, both are numbers nobody acts
 * on.
 */
function TotalRow({ label, totals }: { label: string; totals: PeriodTotals }) {
  const palette = usePalette();
  return (
    <View testID="period-total" style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: palette.text }]}>{label}</Text>
      <View style={styles.totalNumbers}>
        <Text style={[styles.tabular, { color: palette.text }]}>
          {totals.seconds > 0 ? formatElapsed(totals.seconds) : '—'}
        </Text>
        <Text style={[styles.small, styles.tabular, { color: palette.dimmed }]}>
          {totals.days === 1 ? '1 day trained' : `${String(totals.days)} days trained`}
        </Text>
      </View>
    </View>
  );
}

type CalendarView = 'month' | 'year';

function CalendarPanel() {
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { summaries, isPending } = useDayIndex();
  const { profile, isPending: profilePending } = useProfile();

  const today = localDateKey();
  const [view, setView] = useState<CalendarView>('month');
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(today));
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [selected, setSelected] = useState<string | null>(null);

  /**
   * The one-time build of the index from the sessions themselves, for an
   * account logged against before the index existed (see the web's).
   */
  const stale = !profilePending && profile.dayIndexVersion < DAY_INDEX_VERSION;
  const [building, setBuilding] = useState(false);
  const built = useRef(false);

  useEffect(() => {
    if (uid === null || !stale || built.current) return;
    built.current = true;
    setBuilding(true);
    // Not reported: the index is a cache, and leaving the tab retries.
    void rebuildDayIndex(uid)
      .catch(() => {
        built.current = false;
      })
      .finally(() => {
        setBuilding(false);
      });
  }, [uid, stale]);

  const activity: ActivityByDay = useMemo(() => activityByDay(summaries), [summaries]);
  const streak = useMemo(() => weekStreak(activity, today), [activity, today]);
  const since = useMemo(() => firstTrainedDay(activity), [activity]);

  const thisWeek = weekStartOf(today);
  const thisYear = Number(today.slice(0, 4));
  const totals = useMemo(
    () => ({
      week: periodTotals(activity, thisWeek, thisWeek === null ? null : weekEndOf(thisWeek)),
      month: periodTotals(activity, monthStart(monthKeyOf(today)), monthEnd(monthKeyOf(today))),
      year: periodTotals(activity, yearStart(thisYear), yearEnd(thisYear)),
      all: periodTotals(activity, null, null),
    }),
    [activity, today, thisWeek, thisYear],
  );

  if (isPending || profilePending || building) {
    return <ActivityIndicator color={palette.accent} style={styles.spinner} />;
  }
  if (summaries.length === 0) return <EmptyHistory />;

  const step = (offset: number): void => {
    setSelected(null);
    if (view === 'month') setMonthKey((current) => shiftMonth(current, offset));
    else setYear((current) => current + offset);
  };

  return (
    <View style={styles.timeline}>
      <Card>
        <TotalRow label="This week" totals={totals.week} />
        <TotalRow label="This month" totals={totals.month} />
        <TotalRow label="This year" totals={totals.year} />
        <TotalRow label="All time" totals={totals.all} />
        <Small>
          {since === null
            ? 'All time covers everything logged.'
            : `All time covers everything since ${formatDateWithYear(since)}.`}{' '}
          Session time is counted for finished sessions.
        </Small>
      </Card>

      <Card testID="streak-card">
        <View style={styles.totalRow}>
          <View style={styles.grow}>
            <Heading>
              {streak.current === 0
                ? 'No run going'
                : `${String(streak.current)} ${streak.current === 1 ? 'week' : 'weeks'} in a row`}
            </Heading>
            <Small>
              {streak.trainedThisWeek
                ? 'This week counts already.'
                : 'This week is still open — it counts as soon as you log something.'}
            </Small>
          </View>
          <Badge label={`best ${String(streak.best)}`} />
        </View>
      </Card>

      <Segmented
        label="Calendar view"
        options={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
        value={view}
        onChange={(next) => {
          setView(next);
          setSelected(null);
        }}
      />

      <View style={styles.stepRow}>
        <StepArrow
          label={view === 'month' ? 'Previous month' : 'Previous year'}
          glyph="‹"
          onPress={() => {
            step(-1);
          }}
        />
        <Heading>{view === 'month' ? formatMonthLabel(monthKey) : String(year)}</Heading>
        <StepArrow
          label={view === 'month' ? 'Next month' : 'Next year'}
          glyph="›"
          onPress={() => {
            step(1);
          }}
        />
      </View>

      {view === 'month' ? (
        <MonthCalendar
          monthKey={monthKey}
          activity={activity}
          selected={selected}
          onSelect={setSelected}
        />
      ) : (
        <YearCalendar year={year} activity={activity} />
      )}

      <CalendarLegend />

      {view === 'month' ? (
        <TotalRow
          label={formatMonthLabel(monthKey)}
          totals={periodTotals(activity, monthStart(monthKey), monthEnd(monthKey))}
        />
      ) : (
        <TotalRow
          label={String(year)}
          totals={periodTotals(activity, yearStart(year), yearEnd(year))}
        />
      )}

      {selected === null ? null : <SelectedDay dateKey={selected} />}
    </View>
  );
}

function StepArrow({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrow,
        { borderColor: palette.border, backgroundColor: palette.surface },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.arrowGlyph, { color: palette.text }]}>{glyph}</Text>
    </Pressable>
  );
}

/** The sessions on one day, read only when a square is opened. */
function SelectedDay({ dateKey }: { dateKey: string }) {
  const palette = usePalette();
  const { sessions, isPending } = useSessionsOn(dateKey);
  const { profile } = useProfile();

  return (
    <View style={styles.section}>
      <Heading>{formatDayLabel(dateKey)}</Heading>
      {isPending ? (
        <ActivityIndicator color={palette.accent} />
      ) : sessions.length === 0 ? (
        <Body dimmed>Nothing logged on this day.</Body>
      ) : (
        sessions.map((session) => (
          <SessionRow key={session.id} session={session} displayUnit={profile.displayUnit} />
        ))
      )}
    </View>
  );
}

function Records() {
  const push = usePush();
  const palette = usePalette();
  const { stats, isPending } = useAllExerciseStats();
  const { profile } = useProfile();
  const { resolver } = useExerciseLibrary();
  /** The record whose e1RM explanation is open: the phone's stand-in for the web's tooltip. */
  const [explained, setExplained] = useState<string | null>(null);

  // Newest record first: the feed is "what have I just beaten", not a ranking.
  const feed = useMemo(
    () =>
      stats
        // A record is a best set. Its score can be below zero (an assisted lift).
        .filter((entry) => entry.bestSet !== null)
        .sort((a, b) => (b.bestE1rmAt ?? '').localeCompare(a.bestE1rmAt ?? '')),
    [stats],
  );

  if (isPending) return <Loading />;

  if (feed.length === 0) {
    return (
      <Card>
        <Body dimmed>
          No records yet. A record is set when a working set beats your best estimated 1RM for that
          lift — warmups and skipped sets never count.
        </Body>
      </Card>
    );
  }

  return (
    <View style={styles.section}>
      {feed.map((entry) => {
        const exercise = resolver.resolve(entry.exerciseId);
        const name = exercise?.name ?? entry.exerciseId;
        const set = entry.bestSet;
        const open = explained === entry.exerciseId;
        return (
          <Card
            key={entry.exerciseId}
            testID="record-row"
            onPress={() => {
              push({
                pathname: '/history/exercise/[exerciseId]',
                params: { exerciseId: entry.exerciseId },
              });
            }}
          >
            <View style={styles.totalRow}>
              <View style={styles.grow}>
                <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>
                  {name}
                </Text>
                <Small>
                  {set === null ? '—' : formatSet(set, profile.displayUnit)}
                  {entry.bestE1rmAt === null ? '' : ` · ${formatDateWithYear(entry.bestE1rmAt)}`}
                </Small>
              </View>
              {/* Labelled, because a bare weight beside the set that earned it
                  reads as "the weight you lifted" and is not. Tap for why. */}
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Explains the estimate"
                hitSlop={8}
                onPress={() => {
                  setExplained(open ? null : entry.exerciseId);
                }}
              >
                <Badge
                  tone="orange"
                  label={`e1RM ${formatE1rm(entry.bestE1rm, profile.displayUnit)}`}
                />
              </Pressable>
            </View>
            {open && set !== null ? (
              <Small>{describeE1rm(set, profile.displayUnit, loadScaleFor(exercise)) ?? ''}</Small>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { paddingVertical: 32 },
  timeline: { gap: 16 },
  section: { gap: 8 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  mapCard: { borderWidth: 1, borderRadius: 8, padding: 12 },
  loadingMore: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  totalLabel: { fontSize: 14, fontWeight: '600' },
  totalNumbers: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tabular: { fontSize: 14, fontVariant: ['tabular-nums'] },
  small: { fontSize: 12 },
  grow: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arrow: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowGlyph: { fontSize: 22, lineHeight: 24 },
  pressed: { opacity: 0.7 },
});
