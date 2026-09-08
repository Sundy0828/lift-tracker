import { Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { Session } from '@/domain/sessions';
import { sessionSeconds } from '@/domain/sessions';
import { formatEstimate } from '@/domain/workouts';

/**
 * How long the session has been running.
 *
 * **Its own component, with its own interval**, for the same reason the rest
 * countdown is: anything that ticks re-renders, and a clock living on the
 * active-session screen would re-render all fifty set rows on every tick and
 * undo the memoization the set grid depends on (§3).
 *
 * Minute resolution, so it is checked every twenty seconds rather than every
 * second. A session is measured in tens of minutes; a running seconds counter
 * would be a moving distraction on a screen you are trying to read numbers
 * off, and would cost three times the renders to say nothing more.
 */

type Props = {
  session: Session;
};

const TICK_MS = 20_000;

export function SessionClock({ session }: Props) {
  const isRunning = session.completedAt === null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);

    // Resynced when the app comes back, because a phone in a pocket freezes
    // the interval and the elapsed time would otherwise be short by however
    // long it was away.
    const resync = (): void => {
      setNow(Date.now());
    };
    document.addEventListener('visibilitychange', resync);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', resync);
    };
  }, [isRunning]);

  const seconds = sessionSeconds(session, new Date(now));
  if (seconds === null) return null;

  return (
    <Text component="span" size="xs" c="dimmed" data-testid="session-clock">
      {isRunning ? formatEstimate(seconds) : `${formatEstimate(seconds)} total`}
    </Text>
  );
}
