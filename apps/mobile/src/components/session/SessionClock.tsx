import { platform } from '@lift/data/platform';
import type { Session } from '@lift/domain/sessions';
import { sessionSeconds } from '@lift/domain/sessions';
import { formatEstimate } from '@lift/domain/workouts';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { usePalette } from '../../theme';

/**
 * How long the session has been running, at minute resolution. Its own
 * component with its own interval, for the same reason the rest bar is: a
 * tick on the screen itself would re-render every set row.
 */

const TICK_MS = 20_000;
const DAY_SECONDS = 86_400;

function formatDays(seconds: number): string {
  const days = Math.floor(seconds / DAY_SECONDS);
  const hours = Math.floor((seconds % DAY_SECONDS) / 3600);
  return hours === 0 ? `${String(days)} d` : `${String(days)} d ${String(hours)} h`;
}

export function SessionClock({ session }: { session: Session }) {
  const palette = usePalette();
  const isRunning = session.completedAt === null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const resync = (): void => {
      setNow(Date.now());
    };
    const interval = setInterval(resync, TICK_MS);
    // A suspended app's interval does not run, so it is wrong on return.
    const unsubscribe = platform().onForeground(resync);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [isRunning]);

  const seconds = sessionSeconds(session, new Date(now));
  if (seconds === null) return null;
  const elapsed = seconds >= DAY_SECONDS ? formatDays(seconds) : formatEstimate(seconds);

  return (
    <Text style={{ fontSize: 13, color: palette.dimmed }}>
      {isRunning ? elapsed : `${elapsed} total`}
    </Text>
  );
}
