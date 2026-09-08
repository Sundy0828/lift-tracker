import { Text, Tooltip } from '@mantine/core';
import type { Overlay } from '@/domain/overlay';
import { daysBetween, localDateKey } from '@/domain/sessions';
import classes from './OverlayLine.module.css';

/**
 * The header line above an exercise's sets: where last time's numbers came
 * from.
 *
 * The two tiers are deliberately unequal (§2.6). Tier 1 is this workout's own
 * history and is the thing you are trying to beat, so it is stated plainly.
 * Tier 2 is the same lift on a different day, at different fatigue, and is
 * **labelled with where it came from** — because a number presented as your
 * last performance, when it was really a different day type, would quietly
 * mislead every session after it.
 *
 * **Built to survive a long name.** "CHEST + DELTS" and a date already fill a
 * narrow phone, and a workout can be called anything. So the line is a flex
 * row where only the name is allowed to shrink, and it truncates with an
 * ellipsis while the date — the part that changes, and the part you are
 * actually reading for — always stays whole. The full name is in the tooltip.
 */

type Props = {
  overlay: Overlay;
  /** The workout being performed, for the tier-1 label. */
  workoutName: string;
};

/**
 * A workout with no name yet, or an ad-hoc session, would otherwise read as
 * "Last  · Aug 24" or "Last Ad-hoc session · Aug 24".
 */
function describeSource(name: string, workoutId: string | null): string {
  if (workoutId === null) return 'an ad-hoc session';
  return name.trim() === '' ? 'an unnamed workout' : name;
}

/** "Aug 26", or "today" / "yesterday" when that reads better. */
function relativeDate(dateKey: string): string {
  const today = localDateKey();
  const days = daysBetween(dateKey, today);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';

  const parts = dateKey.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return dateKey;

  const formatted = new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  // The year only when it is not the current one; "Aug 26, 2024" on every row
  // of a fresh session would be noise.
  return year === new Date().getFullYear() ? formatted : `${formatted}, ${String(year)}`;
}

export function OverlayLine({ overlay, workoutName }: Props) {
  if (overlay.kind === 'new') {
    return (
      <Text size="xs" c="dimmed">
        First time — no history to compare against yet.
      </Text>
    );
  }

  const date = relativeDate(overlay.data.performedOn);

  if (overlay.kind === 'same-workout') {
    const name = describeSource(workoutName, overlay.data.workoutId);
    return (
      <div className={`${classes.line} ${classes.primary}`}>
        <span className={classes.lead}>Last</span>
        <Tooltip label={name} withArrow openDelay={400}>
          <span className={classes.name}>{name}</span>
        </Tooltip>
        <span className={classes.date}>· {date}</span>
      </div>
    );
  }

  /**
   * Tier 2 says the two things that matter — which day it came from, and that
   * it is not a comparison — and says the second one in a tag rather than a
   * clause. The long-form explanation sits in the tooltip, because it is read
   * once and then understood, while the line itself is read on every set.
   */
  const source = describeSource(overlay.data.workoutName, overlay.data.workoutId);
  return (
    <div className={`${classes.line} ${classes.secondary}`}>
      <span className={classes.lead}>From</span>
      <Tooltip label={source} withArrow openDelay={400}>
        <span className={classes.name}>{source}</span>
      </Tooltip>
      <span className={classes.date}>· {date}</span>
      <Tooltip
        label="Not this workout's own history. Shown to suggest a load, not compared against — so there is no delta."
        withArrow
        multiline
        w={240}
      >
        <span className={classes.tag} tabIndex={0}>
          reference
        </span>
      </Tooltip>
    </div>
  );
}
