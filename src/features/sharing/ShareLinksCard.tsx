import { Card, Progress, Stack, Text } from '@mantine/core';
import { useShares } from '@/data/hooks/useSharedWorkout';
import { MAX_LIVE_SHARES, liveShares, sharesRemaining } from '@/domain/sharing';
import { ShareInventory } from './ShareInventory';

/**
 * Every link you have open, in one place.
 *
 * The cap counts across all your workouts, so the workout you happen to be
 * looking at is the wrong place to manage it from. This is the screen that
 * answers "what is holding the limit, and which of these do I still need".
 */
export function ShareLinksCard() {
  const { shares, isPending } = useShares();

  const open = liveShares(shares).length;
  const remaining = sharesRemaining(shares);

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text fw={600}>Shared links</Text>

        <Text size="sm" c="dimmed">
          A link stays open until you turn it off. There is a limit of {String(MAX_LIVE_SHARES)}{' '}
          open at once, across every workout — nothing is ever turned off on your behalf to make
          room, because somebody may still be using it.
        </Text>

        {isPending ? null : (
          <>
            <Progress
              value={(open / MAX_LIVE_SHARES) * 100}
              size="sm"
              color={remaining === 0 ? 'orange' : 'sky'}
              aria-label="Open links"
            />
            <Text size="xs" c="dimmed">
              {String(open)} of {String(MAX_LIVE_SHARES)} open
              {remaining === 0
                ? ' — turn one off to make another.'
                : `, ${String(remaining)} left.`}
            </Text>
          </>
        )}

        <ShareInventory />
      </Stack>
    </Card>
  );
}
