import type { ActivityByDay, CalendarWeek } from '@lift/domain/calendar';
import { dayStop, monthGrid, weekdayInitials, yearGrid } from '@lift/domain/calendar';
import { formatDayLabel, formatElapsed } from '@lift/domain/history';
import { localDateKey } from '@lift/domain/sessions';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette, type Palette } from '../../theme';

/**
 * Training as squares: one month in a grid, or a whole year in dots. The
 * web's `ActivityCalendar`, from the same domain functions.
 *
 * The shading is banded on **set count**, so a bodyweight day is not a blank
 * square, and the bands are absolute (`@lift/domain/calendar`), so two months
 * can be compared by eye. Stop 0 is an outline, not a colour: an empty day is
 * not a light workout.
 */

function describeDay(dateKey: string, activity: ActivityByDay): string {
  const day = activity.get(dateKey);
  const label = formatDayLabel(dateKey);
  if (day === undefined) return `${label}, rest day`;
  const sessions = day.sessions === 1 ? '1 session' : `${String(day.sessions)} sessions`;
  const time = day.seconds > 0 ? `, ${formatElapsed(day.seconds)}` : '';
  return `${label}, ${sessions}${time}`;
}

function stopFor(dateKey: string, activity: ActivityByDay): number {
  return dayStop(activity.get(dateKey)?.sets ?? 0);
}

/** The fill for a stop, or none for 0. */
function fillFor(stop: number, palette: Palette): string | undefined {
  return stop === 0 ? undefined : palette.calendar[stop - 1];
}

export function MonthCalendar({
  monthKey,
  activity,
  selected,
  onSelect,
}: {
  /** `YYYY-MM`. */
  monthKey: string;
  activity: ActivityByDay;
  /** The day open below the grid, or null. */
  selected: string | null;
  onSelect: (dateKey: string | null) => void;
}) {
  const palette = usePalette();
  const weeks = useMemo(() => monthGrid(monthKey), [monthKey]);
  const initials = useMemo(() => weekdayInitials(), []);
  const today = localDateKey();

  return (
    <View testID="month-calendar" style={styles.month}>
      <View style={styles.week} importantForAccessibility="no-hide-descendants">
        {initials.map((initial, index) => (
          <Text
            key={`${initial}-${String(index)}`}
            style={[styles.weekday, { color: palette.dimmed }]}
          >
            {initial}
          </Text>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week.weekStart} style={styles.week}>
          {week.days.map((dateKey, index) => {
            if (dateKey === null)
              return <View key={`${week.weekStart}-${String(index)}`} style={styles.cell} />;
            const fill = fillFor(stopFor(dateKey, activity), palette);
            const isSelected = dateKey === selected;
            const isToday = dateKey === today;
            // Selected wins over today: it is what you just did.
            const ring = isSelected ? palette.text : isToday ? palette.accent : 'transparent';
            return (
              <View key={dateKey} style={[styles.cell, styles.ring, { borderColor: ring }]}>
                <Pressable
                  testID={`calendar-day-${dateKey}`}
                  accessibilityRole="button"
                  accessibilityLabel={describeDay(dateKey, activity)}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onSelect(isSelected ? null : dateKey);
                  }}
                  style={[
                    styles.day,
                    {
                      backgroundColor: fill,
                      borderColor: fill === undefined ? palette.border : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      fill === undefined
                        ? { color: palette.dimmed }
                        : { color: palette.text, fontWeight: '600' },
                    ]}
                  >
                    {Number(dateKey.slice(8))}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** How many bands the year is stacked in: two halves of ~27 week columns. */
const BANDS = 2;

/** The column each month starts in, one label per column (see the web's). */
function monthLabels(band: readonly CalendarWeek[]): Map<number, string> {
  const labels = new Map<number, string>();
  const seen = new Set<string>();
  band.forEach((week, column) => {
    for (const dateKey of week.days) {
      if (dateKey === null) continue;
      const month = dateKey.slice(0, 7);
      if (seen.has(month)) continue;
      seen.add(month);
      if (!labels.has(column)) labels.set(column, dateKey);
    }
  });
  return labels;
}

const MONTH_SHORT: Intl.DateTimeFormatOptions = { month: 'short' };

/**
 * A whole year as the contribution graph: a column per week, a row per
 * weekday, Monday at the top. Stacked in two halves rather than scrolled, so
 * the squares stay big enough to read on a phone. Decorative: every number
 * behind it is in the totals.
 */
export function YearCalendar({ year, activity }: { year: number; activity: ActivityByDay }) {
  const bands = useMemo(() => {
    const weeks = yearGrid(year);
    const perBand = Math.ceil(weeks.length / BANDS);
    return Array.from({ length: BANDS }, (_, index) =>
      weeks.slice(index * perBand, (index + 1) * perBand),
    ).filter((band) => band.length > 0);
  }, [year]);

  return (
    <View
      testID="year-calendar"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Training through ${String(year)}`}
      style={styles.year}
    >
      {bands.map((band) => (
        <YearBand key={band[0]?.weekStart ?? ''} band={band} activity={activity} />
      ))}
    </View>
  );
}

function YearBand({ band, activity }: { band: readonly CalendarWeek[]; activity: ActivityByDay }) {
  const palette = usePalette();
  const labels = useMemo(() => monthLabels(band), [band]);

  return (
    <View style={styles.band}>
      <View style={styles.bandMonths}>
        {band.map((week, column) => {
          const start = labels.get(column);
          return (
            <View key={week.weekStart} style={styles.bandColumn}>
              {start === undefined ? null : (
                <Text numberOfLines={1} style={[styles.bandMonth, { color: palette.dimmed }]}>
                  {new Date(
                    Number(start.slice(0, 4)),
                    Number(start.slice(5, 7)) - 1,
                    1,
                  ).toLocaleDateString(undefined, MONTH_SHORT)}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.bandDays}>
        {band.map((week) => (
          <View key={week.weekStart} style={styles.bandColumn}>
            {week.days.map((dateKey, index) => {
              if (dateKey === null)
                return <View key={`${week.weekStart}-${String(index)}`} style={styles.dot} />;
              const fill = fillFor(stopFor(dateKey, activity), palette);
              return (
                <View
                  key={dateKey}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: fill,
                      borderColor: fill === undefined ? palette.border : 'transparent',
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The shared key for both views. */
export function CalendarLegend() {
  const palette = usePalette();
  return (
    <View style={styles.legend} importantForAccessibility="no-hide-descendants">
      <Text style={[styles.small, { color: palette.dimmed }]}>Lighter</Text>
      <View style={styles.swatches}>
        {([0, 1, 2, 3, 4] as const).map((stop) => {
          const fill = fillFor(stop, palette);
          return (
            <View
              key={stop}
              style={[
                styles.swatch,
                {
                  backgroundColor: fill,
                  borderColor: fill === undefined ? palette.border : 'transparent',
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.small, { color: palette.dimmed }]}>Heavier · by sets logged</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  month: { gap: 4 },
  week: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, paddingBottom: 2 },
  cell: { flex: 1, aspectRatio: 1 },
  // Today and the open day: a 2 px ring around the square, as the web's outline.
  ring: { borderWidth: 2, borderRadius: 6, padding: 1 },
  day: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: { fontSize: 12, fontVariant: ['tabular-nums'] },
  year: { gap: 10 },
  band: { gap: 2 },
  bandMonths: { flexDirection: 'row', gap: 2, height: 13 },
  // Allowed past its column: a three-letter month is wider than a week.
  bandMonth: { position: 'absolute', left: 0, width: 40, fontSize: 10, lineHeight: 13 },
  bandDays: { flexDirection: 'row', gap: 2 },
  bandColumn: { flex: 1, gap: 2 },
  dot: { aspectRatio: 1, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  swatches: { flexDirection: 'row', gap: 3 },
  swatch: { width: 11, height: 11, borderRadius: 2, borderWidth: 1 },
  small: { fontSize: 12 },
});
