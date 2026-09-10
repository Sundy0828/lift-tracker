import { Badge, Button, Card, CopyButton, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { useShares } from '@/data/hooks/useSharedWorkout';
import { newShareId, publishShare, setShareRevoked } from '@/data/mutations/sharing';
import { buildSharePayload } from '@/domain/sharing';
import type { SharedWorkout } from '@/domain/sharing';
import type { Workout, WorkoutVersion } from '@/domain/workouts';
import { shareUrl } from './shareLink';

/**
 * Publishing a link to a workout, and turning one off.
 *
 * A share carries a **published version**, never the working copy (§2.5): what
 * someone else receives has to be a snapshot that cannot change under them,
 * and the draft on screen is not that. So an unpublished workout cannot be
 * shared, and the panel says why rather than hiding the button.
 *
 * Each press mints a new link rather than rewriting the last one. That is the
 * honest model for something already sent to somebody: revoking the link you
 * gave your training partner last month should not be a side effect of sharing
 * this month's version with someone else.
 */
export function SharePanel({
  workout,
  version,
}: {
  workout: Workout;
  version: WorkoutVersion | null;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { resolver } = useExerciseLibrary();
  const { shares, isPending } = useShares();
  const [busy, setBusy] = useState(false);

  const mine = shares.filter((share) => share.sourceWorkoutId === workout.id);
  const live = mine.filter((share) => !share.revoked);
  const revoked = mine.filter((share) => share.revoked);

  const share = async (): Promise<void> => {
    if (version === null || uid === null) return;
    setBusy(true);
    const shareId = newShareId();
    try {
      await publishShare(
        shareId,
        buildSharePayload({
          // The rules key on this, so it is the signed-in uid or nothing.
          ownerUid: uid,
          sourceWorkoutId: workout.id,
          versionNumber: version.versionNumber,
          body: version,
          resolve: resolver.resolve,
        }),
      );
      notifications.show({ message: 'Link created', color: 'teal' });
    } catch {
      notifications.show({ message: 'Could not create the link', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  if (version === null) {
    return (
      <Text size="sm" c="dimmed">
        Publish a version first. A shared workout is a snapshot someone else can rely on, so there
        has to be one to send.
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        A link anyone can open, with no account needed to look at it. It carries v
        {String(version.versionNumber)} as it stands now — later edits do not change what a link
        already sent shows.
      </Text>

      <Group>
        <Button size="compact-sm" loading={busy} onClick={() => void share()}>
          Create a link to v{String(version.versionNumber)}
        </Button>
      </Group>

      {isPending || mine.length === 0 ? null : (
        <Stack gap="xs">
          {live.map((entry) => (
            <ShareRow key={entry.shareId} share={entry} />
          ))}
          {revoked.length === 0 ? null : (
            <Text size="xs" c="dimmed">
              {revoked.length === 1
                ? '1 link has been turned off.'
                : `${String(revoked.length)} links have been turned off.`}{' '}
              Anyone who opens one is told it was revoked.
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function ShareRow({ share }: { share: SharedWorkout }) {
  const [busy, setBusy] = useState(false);
  const url = shareUrl(share.shareId);

  const revoke = async (): Promise<void> => {
    setBusy(true);
    try {
      await setShareRevoked(share.shareId, true);
      notifications.show({ message: 'Link turned off', color: 'gray' });
    } catch {
      notifications.show({ message: 'Could not turn the link off', color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card withBorder padding="xs">
      <Stack gap={6}>
        <Group gap="xs" wrap="nowrap">
          <Badge size="xs" variant="light" color="sky">
            v{String(share.versionNumber)}
          </Badge>
          <Text size="xs" c="dimmed" truncate style={{ minWidth: 0 }}>
            {url}
          </Text>
        </Group>
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
