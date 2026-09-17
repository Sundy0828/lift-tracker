import { Badge, Button, Card, CopyButton, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useShares } from '@/data/hooks/useSharedWorkout';
import { setShareRevoked } from '@/data/mutations/sharing';
import type { SharedWorkout } from '@/domain/sharing';
import { MAX_LIVE_SHARES, liveSharesByAge } from '@/domain/sharing';
import { formatDateWithYear } from '@/domain/history';
import { describeShareError } from './shareError';
import { shareUrl } from './shareLink';

/**
 * Every link you have open, across every workout.
 *
 * The cap counts **all** your live links (IDEAS §11.1), so the place you hit it
 * is rarely the workout that filled it. A panel that only listed the current
 * workout's links could offer you nothing to turn off but "the oldest one",
 * unnamed — which is asking someone to revoke something they cannot see.
 *
 * Each row names the workout as it was when the link was made, which is also
 * what the recipient sees. Nothing is revoked automatically: a link is
 * something you handed to somebody, and taking it back is a decision.
 */

export function ShareInventoryRow({ share }: { share: SharedWorkout }) {
  const [busy, setBusy] = useState(false);
  const url = shareUrl(share.shareId);
  const name = share.body.name === '' ? 'Untitled workout' : share.body.name;

  const revoke = async (): Promise<void> => {
    setBusy(true);
    try {
      await setShareRevoked(share.shareId, true);
      notifications.show({ message: `Link to ${name} turned off`, color: 'gray' });
    } catch (cause: unknown) {
      notifications.show({
        message: describeShareError(cause, 'Could not turn the link off'),
        color: 'red',
        autoClose: false,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card withBorder padding="xs" data-testid="share-inventory-row">
      <Stack gap={6}>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} truncate style={{ minWidth: 0 }}>
            {name}
          </Text>
          <Badge size="xs" variant="light" color="sky" style={{ flexShrink: 0 }}>
            v{String(share.versionNumber)}
          </Badge>
          {share.toUid === null ? null : (
            <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
              sent
            </Badge>
          )}
        </Group>

        <Text size="xs" c="dimmed">
          {share.createdAt === null ? 'Shared' : `Shared ${formatDateWithYear(share.createdAt)}`}
        </Text>

        {/* The link itself, not just a Copy button: seeing what you are about
            to send is part of deciding to send it. */}
        <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
          {url}
        </Text>

        <Group gap="xs">
          <CopyButton value={url}>
            {({ copied, copy }) => (
              <Button size="compact-xs" variant="light" onClick={copy}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            )}
          </CopyButton>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            loading={busy}
            onClick={() => void revoke()}
          >
            Turn off
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

/**
 * The whole inventory, oldest first.
 *
 * `limit` trims it for the warning inside the share panel, where the point is
 * to offer a way out rather than to list everything.
 */
export function ShareInventory({ limit }: { limit?: number }) {
  const { shares, isPending } = useShares();
  const open = liveSharesByAge(shares);
  const shown = limit === undefined ? open : open.slice(0, limit);

  if (isPending) return null;

  if (open.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No links are open. You can make up to {String(MAX_LIVE_SHARES)}.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      {shown.map((share) => (
        <ShareInventoryRow key={share.shareId} share={share} />
      ))}
      {limit !== undefined && open.length > shown.length ? (
        <Text size="xs" c="dimmed">
          {String(open.length - shown.length)} more in Settings, under Shared links.
        </Text>
      ) : null}
    </Stack>
  );
}
