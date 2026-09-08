import { Text } from '@mantine/core';
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
 * shown smaller and **labelled with where it came from** — because a number
 * presented as your last performance, when it was really a different day type,
 * would quietly mislead every session after it.
 */

type Props = {
  overlay: Overlay;
  /** The workout being performed, for the tier-1 label. */
  workoutName: string;
};

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

  if (overlay.kind === 'same-workout') {
    return (
      <Text size="xs" fw={550} className={classes.primary}>
        Last {workoutName} · {relativeDate(overlay.data.performedOn)}
      </Text>
    );
  }

  return (
    <Text size="xs" c="dimmed" className={classes.secondary}>
      No {workoutName} history · last done on {overlay.data.workoutName},{' '}
      {relativeDate(overlay.data.performedOn)} — reference only, no comparison
    </Text>
  );
}
