import { Text, Tooltip } from '@mantine/core';
import { useMemo } from 'react';
import type { ActivityByDay, CalendarWeek } from '@/domain/calendar';
import { dayStop, monthGrid, weekdayInitials, yearGrid } from '@/domain/calendar';
import { formatDayLabel, formatElapsed } from '@/domain/history';
import { localDateKey } from '@/domain/sessions';
import classes from './ActivityCalendar.module.css';

/**
 * Training as squares: one month in a grid, or a whole year in dots.
 *
 * The shading is the muscle map's five-stop scale, banded on **set count**
 * rather than tonnage so a bodyweight day is not a blank square. Bands are
 * absolute (see `domain/calendar`), which is what lets two months be compared
 * by eye — rescaling each grid to its own busiest day would make a light month
 * look like a heavy one.
 *
 * Neither view is the accessible record of anything. The numbers live in the
 * totals beside them and in the session list below; a square is a way in.
 */

function describeDay(dateKey: string, activity: ActivityByDay): string {
  const day = activity.get(dateKey);
  const label = formatDayLabel(dateKey);
  if (day === undefined) return `${label} — rest day`;

  const sessions = day.sessions === 1 ? '1 session' : `${String(day.sessions)} sessions`;
  const time = day.seconds > 0 ? ` · ${formatElapsed(day.seconds)}` : '';
  return `${label} — ${sessions}${time}`;
}

function stopFor(dateKey: string, activity: ActivityByDay): number {
  return dayStop(activity.get(dateKey)?.sets ?? 0);
}

export type MonthCalendarProps = {
  /** `YYYY-MM`. */
  monthKey: string;
  activity: ActivityByDay;
  /** The day currently open below the grid, or null. */
  selected: string | null;
  onSelect: (dateKey: string | null) => void;
};

export function MonthCalendar({ monthKey, activity, selected, onSelect }: MonthCalendarProps) {
  const weeks = useMemo(() => monthGrid(monthKey), [monthKey]);
  const initials = useMemo(() => weekdayInitials(), []);
  const today = localDateKey();

  return (
    <div className={`${classes.stops} ${classes.grid}`} data-testid="month-calendar">
      {initials.map((initial, index) => (
        <div key={`${initial}-${String(index)}`} className={classes.weekday} aria-hidden="true">
          {initial}
        </div>
      ))}

      {weeks.flatMap((week) =>
        week.days.map((dateKey, index) =>
          dateKey === null ? (
            <div key={`${week.weekStart}-${String(index)}`} className={classes.blank} />
          ) : (
            <Tooltip key={dateKey} label={describeDay(dateKey, activity)} withArrow openDelay={300}>
              <button
                type="button"
                className={classes.day}
                data-stop={String(stopFor(dateKey, activity))}
                data-today={dateKey === today ? '' : undefined}
                aria-pressed={dateKey === selected}
                aria-label={describeDay(dateKey, activity)}
                onClick={() => {
                  onSelect(dateKey === selected ? null : dateKey);
                }}
              >
                {Number(dateKey.slice(8))}
              </button>
            </Tooltip>
          ),
        ),
      )}
    </div>
  );
}

export type YearCalendarProps = {
  year: number;
  activity: ActivityByDay;
};

const MONTH_SHORT: Intl.DateTimeFormatOptions = { month: 'short' };

/** How many bands the year is stacked in. Two halves of ~27 week columns. */
const BANDS = 2;

/**
 * The column each month starts in, within one band.
 *
 * Only the first column of a month gets a label, and a month that begins in a
 * column another month already claimed is skipped — otherwise two labels land
 * on one column and overlap.
 */
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

/**
 * A whole year as the contribution graph: a column per week, a row per
 * weekday, Monday at the top.
 *
 * **Stacked in two halves rather than scrolled.** Fifty-three columns across a
 * phone leaves a four-pixel square, which is a smear; twenty-seven leaves
 * nearer ten. Same shape, and the whole year is on screen at once.
 *
 * Decorative, like the month grid: every number behind it is in the totals,
 * and each square's own day is in its tooltip.
 */
export function YearCalendar({ year, activity }: YearCalendarProps) {
  const bands = useMemo(() => {
    const weeks = yearGrid(year);
    const perBand = Math.ceil(weeks.length / BANDS);
    return Array.from({ length: BANDS }, (_, index) =>
      weeks.slice(index * perBand, (index + 1) * perBand),
    ).filter((band) => band.length > 0);
  }, [year]);

  return (
    <div
      className={`${classes.stops} ${classes.year}`}
      role="img"
      aria-label={`Training through ${String(year)}`}
      data-testid="year-calendar"
    >
      {bands.map((band) => (
        <YearBand key={band[0]?.weekStart ?? ''} band={band} activity={activity} />
      ))}
    </div>
  );
}

function YearBand({ band, activity }: { band: readonly CalendarWeek[]; activity: ActivityByDay }) {
  const labels = useMemo(() => monthLabels(band), [band]);

  return (
    <div className={classes.band}>
      <div
        className={classes.bandMonths}
        style={{ gridTemplateColumns: `repeat(${String(band.length)}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {band.map((week, column) => {
          const start = labels.get(column);
          return (
            <span key={week.weekStart} className={classes.bandMonth}>
              {start === undefined
                ? ''
                : new Date(
                    Number(start.slice(0, 4)),
                    Number(start.slice(5, 7)) - 1,
                    1,
                  ).toLocaleDateString(undefined, MONTH_SHORT)}
            </span>
          );
        })}
      </div>

      <div
        className={classes.bandDays}
        style={{ gridTemplateColumns: `repeat(${String(band.length)}, minmax(0, 1fr))` }}
      >
        {band.flatMap((week) =>
          week.days.map((dateKey, index) =>
            dateKey === null ? (
              <span
                key={`${week.weekStart}-${String(index)}`}
                className={classes.dot}
                data-outside=""
              />
            ) : (
              <Tooltip
                key={dateKey}
                label={describeDay(dateKey, activity)}
                withArrow
                openDelay={200}
              >
                <span className={classes.dot} data-stop={String(stopFor(dateKey, activity))} />
              </Tooltip>
            ),
          ),
        )}
      </div>
    </div>
  );
}

/** The shared key for both views. */
export function CalendarLegend() {
  return (
    <div className={`${classes.stops} ${classes.legend}`}>
      <Text size="xs" c="dimmed">
        Lighter
      </Text>
      <span className={classes.swatches}>
        {([0, 1, 2, 3, 4] as const).map((stop) => (
          <span key={stop} className={classes.swatch} data-stop={String(stop)} />
        ))}
      </span>
      <Text size="xs" c="dimmed">
        Heavier · by sets logged
      </Text>
    </div>
  );
}
