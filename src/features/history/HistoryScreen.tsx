import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  SegmentedControl,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { MuscleMap } from '@/components/MuscleMap';
import { useAuth } from '@/data/hooks/useAuth';
import { useDayIndex } from '@/data/hooks/useDayIndex';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { useMuscleLookup } from '@/data/hooks/useMuscleLookup';
import { useProfile } from '@/data/hooks/useProfile';
import { useAllExerciseStats } from '@/data/hooks/useRecords';
import { useSessionHistory, useSessionsOn } from '@/data/hooks/useSessionHistory';
import { rebuildDayIndex } from '@/data/mutations/dayIndex';
import { DAY_INDEX_VERSION } from '@/domain/dayIndex';
import type { ActivityByDay, PeriodTotals } from '@/domain/calendar';
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
} from '@/domain/calendar';
import type { MonthGroup, WeekGroup } from '@/domain/history';
import {
  formatDateWithYear,
  formatDayLabel,
  formatElapsed,
  formatSetCount,
  formatVolumeLoad,
  formatWeekLabel,
  groupByMonth,
  groupByWeek,
  sessionDurationSeconds,
  sessionTotals,
  weekEndOf,
  weekStartOf,
} from '@/domain/history';
import type { Session } from '@/domain/sessions';
import { localDateKey } from '@/domain/sessions';
import { describeE1rm, formatE1rm, formatSet } from '@/domain/strength';
import type { Unit } from '@/domain/types';
import type { MuscleLookup } from '@/domain/volume';
import { WEEKLY_STOPS, totalVolume } from '@/domain/volume';
import { CalendarLegend, MonthCalendar, YearCalendar } from './ActivityCalendar';

/**
 * History: what you actually did.
 *
 * Three tabs, because there are three questions. **Sessions** answers "what
 * did I do", keyed on `performedOn` so a session logged the next morning sits
 * on the night it belongs to. **Calendar** answers "how often, and how much" —
 * the shape of a year rather than the contents of a week. **Records** answers
 * "what is my best", read off the tier-2 stats index that PR detection already
 * maintains.
 *
 * The list pages forty sessions at a time and loads more as you reach the end.
 * The calendar reads none of them: it runs off the day index, a small document
 * per year, because a total labelled "this year" cannot be assembled from a
 * page and reading every session to draw squares gets more expensive with
 * every session you ever do (see `domain/dayIndex`).
 */

type SectionProps = {
  label: string;
  sessions: Session[];
  totals: { sessions: number; sets: number; volumeLoadKg: number; restSeconds: number };
  displayUnit: Unit;
  lookup: MuscleLookup;
};

function Section({ label, sessions, totals, displayUnit, lookup }: SectionProps) {
  const [showMap, setShowMap] = useState(false);

  // Only computed once the section is opened: a long timeline would otherwise
  // do this for every group on screen, and the map is the expensive part.
  const volume = useMemo(
    () => (showMap ? totalVolume(sessions, lookup) : null),
    [showMap, sessions, lookup],
  );

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Text fw={650}>{label}</Text>
        <Text size="xs" c="dimmed">
          {totals.sessions === 1 ? '1 session' : `${String(totals.sessions)} sessions`}
        </Text>
      </Group>

      <Group gap={6}>
        <Badge size="sm" variant="light" color="gray">
          {formatSetCount(totals.sets)}
        </Badge>
        {totals.volumeLoadKg > 0 ? (
          <Badge size="sm" variant="light" color="gray">
            {formatVolumeLoad(totals.volumeLoadKg, displayUnit)}
          </Badge>
        ) : null}
        {totals.restSeconds === 0 ? null : (
          <Badge size="sm" variant="light" color="gray">
            {formatElapsed(totals.restSeconds)} resting
          </Badge>
        )}
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
            scopeLabel={label.toLowerCase()}
            testId="weekly-muscle-map"
          />
        </Card>
      )}

      {sessions.map((session) => (
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
            {totals.restSeconds === 0 ? '' : ` · ${formatElapsed(totals.restSeconds)} resting`}
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

function EmptyHistory() {
  return (
    <Card withBorder>
      <Stack gap="xs" align="flex-start">
        <Text fw={600}>Nothing logged yet</Text>
        <Text size="sm" c="dimmed">
          Finish a session and it lands here, filed under the day you did it. Weekly set counts and
          the muscle map are rolled up from sessions you actually logged, so there is nothing to
          show until there is something to show.
        </Text>
        <Button component={Link} to="/" variant="light">
          Start a session
        </Button>
      </Stack>
    </Card>
  );
}

/**
 * Fetches the next page as the end of the list comes into view.
 *
 * A button at the bottom is a tap you make once per forty sessions and then
 * keep making. The sentinel sits a screenful ahead of the end instead, so the
 * next page is already there by the time you reach it — the first page stays
 * as quick to load as it ever was, and nothing waits on a year of history.
 *
 * **Armed on the count it last asked at**, so one crossing asks once. An
 * observer left to fire freely would ask again while the page was still in
 * flight and skip straight past it.
 */
function LoadMore({ count, onReach }: { count: number; onReach: () => void }) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const asked = useRef(-1);
  const observed = typeof IntersectionObserver !== 'undefined';

  useEffect(() => {
    const node = sentinel.current;
    if (node === null || !observed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (asked.current === count) return;
        asked.current = count;
        onReach();
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [count, onReach, observed]);

  return (
    <div ref={sentinel} data-testid="load-more">
      {observed ? (
        <Group justify="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Loading more
          </Text>
        </Group>
      ) : (
        <Button variant="default" fullWidth onClick={onReach}>
          Load more
        </Button>
      )}
    </div>
  );
}

/** How the session list is grouped. A year of weeks is fifty-two headings. */
type Grouping = 'week' | 'month';

function Timeline() {
  const { sessions, isPending, hasMore, loadMore } = useSessionHistory();
  const { profile } = useProfile();
  const { lookup } = useMuscleLookup();
  const [grouping, setGrouping] = useState<Grouping>('week');

  const weeks: WeekGroup[] = useMemo(() => groupByWeek(sessions), [sessions]);
  const months: MonthGroup[] = useMemo(() => groupByMonth(sessions), [sessions]);

  if (isPending) return <Skeleton height={220} radius="md" />;
  if (weeks.length === 0) return <EmptyHistory />;

  return (
    <Stack gap="lg">
      <SegmentedControl
        fullWidth
        size="xs"
        value={grouping}
        onChange={(value) => {
          setGrouping(value === 'month' ? 'month' : 'week');
        }}
        data={[
          { value: 'week', label: 'By week' },
          { value: 'month', label: 'By month' },
        ]}
        aria-label="Group sessions by"
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

      {hasMore ? <LoadMore count={sessions.length} onReach={loadMore} /> : null}
    </Stack>
  );
}

/**
 * One period's headline: how long, and on how many days.
 *
 * **No tonnage and no set count.** Summed over a month both are large numbers
 * nobody acts on — "412,000 lb" and "1,240 sets" say nothing that "18 days"
 * does not. Both stay on a single session, where they are figures you can put
 * next to last week's. The shading still bands on sets; the legend says so.
 */
function TotalRow({ label, totals }: { label: string; totals: PeriodTotals }) {
  return (
    <Group justify="space-between" wrap="nowrap" align="baseline" data-testid="period-total">
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {totals.seconds > 0 ? formatElapsed(totals.seconds) : '—'}
        </Text>
        <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {totals.days === 1 ? '1 day trained' : `${String(totals.days)} days trained`}
        </Text>
      </Group>
    </Group>
  );
}

/** Which grid the calendar tab is showing. */
type CalendarView = 'month' | 'year';

function CalendarPanel() {
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
   * The one-time build of the index from the sessions themselves.
   *
   * An account logged against before the index existed has none, and the
   * version lets a later change to the row shape force it to be made again.
   * It is the expensive read the index exists to avoid, paid once.
   */
  const stale = !profilePending && profile.dayIndexVersion < DAY_INDEX_VERSION;
  const [building, setBuilding] = useState(false);
  const built = useRef(false);

  useEffect(() => {
    if (uid === null || !stale || built.current) return;
    built.current = true;
    setBuilding(true);
    // A failed build is not reported: the index is a cache, the calendar
    // simply stays empty until it succeeds, and leaving the tab retries.
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
  const totals = useMemo(
    () => ({
      week: periodTotals(activity, thisWeek, thisWeek === null ? null : weekEndOf(thisWeek)),
      month: periodTotals(activity, monthStart(monthKeyOf(today)), monthEnd(monthKeyOf(today))),
      year: periodTotals(
        activity,
        yearStart(Number(today.slice(0, 4))),
        yearEnd(Number(today.slice(0, 4))),
      ),
      all: periodTotals(activity, null, null),
    }),
    [activity, today, thisWeek],
  );

  if (isPending || profilePending || building) return <Skeleton height={320} radius="md" />;
  if (summaries.length === 0) return <EmptyHistory />;

  return (
    <Stack>
      <Card withBorder padding="sm">
        <Stack gap={6}>
          <TotalRow label="This week" totals={totals.week} />
          <TotalRow label="This month" totals={totals.month} />
          <TotalRow label="This year" totals={totals.year} />
          <TotalRow label="All time" totals={totals.all} />
          <Text size="xs" c="dimmed">
            {since === null
              ? 'All time covers everything logged.'
              : `All time covers everything since ${formatDateWithYear(since)}.`}{' '}
            Session time is counted for finished sessions.
          </Text>
        </Stack>
      </Card>

      <Card withBorder padding="sm" data-testid="streak-card">
        <Group justify="space-between" wrap="nowrap" align="baseline">
          <Stack gap={0}>
            <Text size="sm" fw={600}>
              {streak.current === 0
                ? 'No run going'
                : `${String(streak.current)} ${streak.current === 1 ? 'week' : 'weeks'} in a row`}
            </Text>
            <Text size="xs" c="dimmed">
              {streak.trainedThisWeek
                ? 'This week counts already.'
                : 'This week is still open — it counts as soon as you log something.'}
            </Text>
          </Stack>
          <Badge variant="light" color="gray" style={{ flexShrink: 0 }}>
            best {String(streak.best)}
          </Badge>
        </Group>
      </Card>

      <SegmentedControl
        fullWidth
        size="xs"
        value={view}
        onChange={(value) => {
          setView(value === 'year' ? 'year' : 'month');
          setSelected(null);
        }}
        data={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
        aria-label="Calendar view"
      />

      <Group justify="space-between" wrap="nowrap">
        <ActionIcon
          variant="default"
          aria-label={view === 'month' ? 'Previous month' : 'Previous year'}
          onClick={() => {
            setSelected(null);
            if (view === 'month') setMonthKey((current) => shiftMonth(current, -1));
            else setYear((current) => current - 1);
          }}
        >
          ‹
        </ActionIcon>
        <Text fw={650}>{view === 'month' ? formatMonthLabel(monthKey) : String(year)}</Text>
        <ActionIcon
          variant="default"
          aria-label={view === 'month' ? 'Next month' : 'Next year'}
          onClick={() => {
            setSelected(null);
            if (view === 'month') setMonthKey((current) => shiftMonth(current, 1));
            else setYear((current) => current + 1);
          }}
        >
          ›
        </ActionIcon>
      </Group>

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
    </Stack>
  );
}

/**
 * The sessions on one day, read only when a square is opened.
 *
 * The calendar itself never touches a session document — but a list of what
 * you did needs their names, and one day is at most a handful of them.
 */
function SelectedDay({ dateKey }: { dateKey: string }) {
  const { sessions, isPending } = useSessionsOn(dateKey);
  const { profile } = useProfile();

  return (
    <Stack gap="xs">
      <Text fw={650}>{formatDayLabel(dateKey)}</Text>
      {isPending ? (
        <Skeleton height={72} radius="md" />
      ) : sessions.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nothing logged on this day.
        </Text>
      ) : (
        sessions.map((session) => (
          <SessionRow key={session.id} session={session} displayUnit={profile.displayUnit} />
        ))
      )}
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
                  {entry.bestE1rmAt === null ? '' : ` · ${formatDateWithYear(entry.bestE1rmAt)}`}
                </Text>
              </Stack>
              {/* Labelled, because a bare weight beside the set that earned
                  it reads as "the weight you lifted" and is not. */}
              <Tooltip
                label={set === null ? '' : (describeE1rm(set, profile.displayUnit) ?? '')}
                disabled={set === null}
                withArrow
                multiline
                w={260}
                openDelay={200}
              >
                <Badge variant="light" color="orange" style={{ flexShrink: 0 }}>
                  e1RM {formatE1rm(entry.bestE1rm, profile.displayUnit)}
                </Badge>
              </Tooltip>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}

/** The tab names, as they appear in the URL. */
const TABS = ['timeline', 'calendar', 'records'] as const;

export default function HistoryScreen() {
  /*
    The open tab lives in the query string, not in component state.

    Records links out to one lift's history, and coming back landed on
    Sessions — the browser restored the URL, and the URL said nothing about
    which tab you had been on. Putting it there makes Back mean what it looks
    like it means, and makes a tab linkable.
  */
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') ?? '';
  const tab = (TABS as readonly string[]).includes(requested) ? requested : 'timeline';

  return (
    <Stack>
      <Title order={2}>History</Title>
      {/* Unmounted when hidden, so the calendar's whole-history read only runs
          on the tab that needs it. */}
      <Tabs
        value={tab}
        onChange={(next) => {
          // Replaced, not pushed: flicking between tabs should not fill the
          // back stack with steps you have to walk out of.
          setParams(next === null || next === 'timeline' ? {} : { tab: next }, { replace: true });
        }}
        keepMounted={false}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="timeline">Sessions</Tabs.Tab>
          <Tabs.Tab value="calendar">Calendar</Tabs.Tab>
          <Tabs.Tab value="records">Records</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="timeline">
          <Timeline />
        </Tabs.Panel>
        <Tabs.Panel value="calendar">
          <CalendarPanel />
        </Tabs.Panel>
        <Tabs.Panel value="records">
          <Records />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
