import { Button, Group, Progress, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/domain/workouts';
import { notificationState } from './notifications';
import type { Rest } from './useRestTimer';
import classes from './RestTimerBar.module.css';

/**
 * The rest countdown, pinned above the bottom navigation.
 *
 * Pinned rather than inline, because the row it belongs to scrolls out of view
 * the moment you look at the next exercise, and a timer you have to hunt for
 * is a timer you stop trusting. It exists only while a rest is running, so it
 * costs no space the rest of the time.
 *
 * **The ticking lives here, not in the hook that owns the deadline.** This is
 * the only thing on screen that changes twice a second; ticking one level up
 * would re-render all fifty set rows at the same rate (§3).
 */

type Props = {
  rest: Rest | null;
  onAdjust: (seconds: number) => void;
  onStop: () => void;
};

export function RestTimerBar({ rest, onAdjust, onStop }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef<number | null>(null);

  useEffect(() => {
    if (rest === null) return;

    // Every 500 ms rather than 1000: a whole-second readout driven off a
    // 1000 ms interval visibly skips numbers as the two drift apart.
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 500);

    // Resynced when the screen comes back, so the number is right on the frame
    // the user actually sees rather than up to half a second later.
    const resync = (): void => {
      setNow(Date.now());
    };
    document.addEventListener('visibilitychange', resync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', resync);
    };
  }, [rest]);

  const remaining = rest === null ? 0 : Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  const isOver = rest !== null && remaining === 0;

  /**
   * A short buzz when the countdown ends with the app in front. The
   * notification covers the screen-off case; this covers the far more common
   * one of the phone sitting on the bench next to you.
   *
   * Keyed on the deadline, so extending a rest re-arms it and a re-render
   * cannot buzz twice for the same one.
   */
  useEffect(() => {
    if (rest === null || !isOver || buzzed.current === rest.endsAt) return;
    buzzed.current = rest.endsAt;
    if ('vibrate' in navigator) navigator.vibrate([120, 80, 120]);
  }, [rest, isOver]);

  if (rest === null) return null;

  const elapsed = rest.total === 0 ? 0 : ((rest.total - remaining) / rest.total) * 100;
  const denied = notificationState() === 'denied';

  return (
    <div className={classes.bar} role="timer" aria-live="off">
      <Progress
        value={isOver ? 100 : elapsed}
        color={isOver ? 'teal' : 'amber'}
        size="xs"
        radius={0}
        transitionDuration={0}
      />
      <Group justify="space-between" wrap="nowrap" gap="xs" px="sm" py={6}>
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <Text fw={650} size="lg" className={classes.clock}>
            {isOver ? 'Go' : formatDuration(remaining)}
          </Text>
          <Text size="xs" c="dimmed" truncate>
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
            {isOver ? 'Dismiss' : 'Skip'}
          </Button>
        </Group>
      </Group>
    </div>
  );
}
