import { Button, Group, Progress, Text } from '@mantine/core';
import { useEffect, useRef } from 'react';
import { formatDuration } from '@/domain/workouts';
import { buzz, chime } from './alert';
import { notificationState } from './notifications';
import type { Rest } from './useRestTimer';
import { restTotal } from './useRestTimer';
import { useRestCountdown } from './useRestCountdown';
import classes from './RestTimerBar.module.css';

/**
 * The rest countdown, pinned above the bottom navigation.
 *
 * Pinned rather than inline, because the row it belongs to scrolls out of view
 * the moment you look at the next exercise, and a timer you have to hunt for
 * is a timer you stop trusting.
 *
 * Past zero it counts the overrun up instead of vanishing, so a rest that ran
 * long says by how much.
 *
 * **The ticking lives here, not in the hook that owns the deadline.** This is
 * the only thing on screen that changes twice a second; ticking one level up
 * would re-render all fifty set rows at the same rate (§3).
 */

type Props = {
  rest: Rest | null;
  /** Plays a tone alongside the vibration when a rest runs out. */
  withChime: boolean;
  onAdjust: (seconds: number) => void;
  onStop: () => void;
  /** Offers a manual start while no rest runs. Null hides the idle bar. */
  onStart?: (() => void) | null;
};

/** Seconds between repeats of the end-of-rest alert. */
const REPEAT_SECONDS = 20;

/** How many times the alert repeats before it gives up. */
const REPEAT_LIMIT = 3;

export function RestTimerBar({ rest, withChime, onAdjust, onStop, onStart = null }: Props) {
  const { left, isOver } = useRestCountdown(rest);

  /** The deadline last alerted for, so a re-render cannot alert twice. */
  const alerted = useRef<number | null>(null);
  /** How many alerts this deadline has already raised. */
  const count = useRef(0);

  /**
   * The alert, repeated while the rest stays over.
   *
   * The notification covers a dark screen; this covers the far more common
   * case of the phone face-up on a bench, where the notification is suppressed
   * for being in the foreground. One buzz there is easy to miss with music on,
   * so it repeats — and then stops, because a timer that nags forever gets
   * turned off.
   *
   * Keyed on the deadline, so extending a rest re-arms it from scratch.
   */
  useEffect(() => {
    if (rest === null || !isOver) return;

    if (alerted.current !== rest.endsAt) {
      alerted.current = rest.endsAt;
      count.current = 0;
    }
    if (count.current >= REPEAT_LIMIT) return;

    // The first alert is due the moment the rest runs out; each repeat is due
    // a fixed gap after it. Driven off the elapsed overrun rather than a
    // timer, so a backgrounded tab does not stack up a burst of them on
    // return.
    const over = -left;
    if (over < count.current * REPEAT_SECONDS) return;

    count.current += 1;
    buzz();
    if (withChime) chime();
  }, [rest, isOver, left, withChime]);

  if (rest === null) {
    if (onStart === null) return null;
    return (
      <div className={classes.bar}>
        <Group justify="space-between" wrap="nowrap" gap="xs" px="sm" py={6}>
          <Text size="xs" c="dimmed">
            No rest running
          </Text>
          <Button size="compact-xs" variant="light" onClick={onStart}>
            Start rest
          </Button>
        </Group>
      </div>
    );
  }

  const total = restTotal(rest);
  const elapsed = ((total - left) / total) * 100;
  const denied = notificationState() === 'denied';

  return (
    <div className={classes.bar} role="timer" aria-live="off" data-over={isOver ? '' : undefined}>
      <Progress
        value={isOver ? 100 : elapsed}
        color={isOver ? 'orange' : 'sky'}
        size="xs"
        radius={0}
        transitionDuration={0}
      />
      <Group justify="space-between" wrap="nowrap" gap="xs" px="sm" py={6}>
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Text fw={650} size="lg" className={classes.clock} data-testid="rest-clock">
            {isOver ? `+${formatDuration(-left)}` : formatDuration(left)}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {isOver ? 'over · ' : ''}
            {rest.label}
            {/* Stated once, here, rather than as a prompt: the countdown works
                either way, and there is nothing the app can do about a
                permission that has already been refused. */}
            {denied ? ' · notifications blocked' : ''}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap">
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Take 15 seconds off the rest"
            onClick={() => {
              onAdjust(-15);
            }}
          >
            −15s
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            aria-label="Add 15 seconds to the rest"
            onClick={() => {
              onAdjust(15);
            }}
          >
            +15s
          </Button>
          <Button size="compact-xs" variant="light" onClick={onStop}>
            {isOver ? 'Done resting' : 'Skip'}
          </Button>
        </Group>
      </Group>
    </div>
  );
}

/**
 * The same countdown, small enough to sit in a panel header.
 *
 * The instructions panel covers the pinned bar, and a rest you cannot see is
 * a rest you stop trusting — so the clock follows you into the panel rather
 * than the bar being drawn over the thing you opened.
 */
export function RestPill({ rest }: { rest: Rest | null }) {
  const { left, isOver } = useRestCountdown(rest);
  if (rest === null) return null;

  return (
    <Text
      size="sm"
      fw={650}
      className={classes.pill}
      data-over={isOver ? '' : undefined}
      data-testid="rest-pill"
      aria-label="Rest remaining"
    >
      {isOver ? `+${formatDuration(-left)}` : formatDuration(left)}
    </Text>
  );
}
