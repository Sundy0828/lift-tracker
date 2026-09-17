import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useAuth } from '@/data/hooks/useAuth';
import { useExerciseLibrary } from '@/data/hooks/useExerciseLibrary';
import { useFriendEdges } from '@/data/hooks/useFriends';
import { useShares } from '@/data/hooks/useSharedWorkout';
import { newShareId, publishShare } from '@/data/mutations/sharing';
import { friends, otherName, otherUid } from '@/domain/friends';
import { MAX_LIVE_SHARES, buildSharePayload, liveShares, sharesRemaining } from '@/domain/sharing';
import type { Workout, WorkoutVersion } from '@/domain/workouts';
import { ShareInventory, ShareInventoryRow } from './ShareInventory';
import { describeShareError } from './shareError';

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
 *
 * A link can be **addressed to a friend**, which adds one thing and nothing
 * else: it shows up in their Workouts screen without them being sent a URL. It
 * is still an ordinary link, and it still tells you nothing about them (IDEAS
 * §4.1).
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
  const { edges } = useFriendEdges();
  const [busy, setBusy] = useState(false);
  const [toUid, setToUid] = useState<string | null>(null);

  // Only connections both sides agreed to: a pending request is not somebody
  // you can send to yet.
  const connected = uid === null ? [] : friends(edges, uid);

  const mine = shares.filter((share) => share.sourceWorkoutId === workout.id);
  const live = mine.filter((share) => !share.revoked);
  const revoked = mine.filter((share) => share.revoked);

  const openEverywhere = liveShares(shares).length;
  const remaining = sharesRemaining(shares);
  const atCap = remaining === 0;

  const share = async (): Promise<void> => {
    if (version === null || uid === null || atCap) return;
    setBusy(true);
    const shareId = newShareId();
    try {
      await publishShare(
        shareId,
        buildSharePayload({
          // The rules key on this, so it is the signed-in uid or nothing.
          ownerUid: uid,
          toUid,
          sourceWorkoutId: workout.id,
          versionNumber: version.versionNumber,
          body: version,
          resolve: resolver.resolve,
        }),
      );
      notifications.show({
        message: toUid === null ? 'Link created' : 'Sent',
        color: 'teal',
      });
    } catch (cause: unknown) {
      notifications.show({
        message: describeShareError(cause, 'Could not create the link'),
        color: 'red',
        autoClose: false,
      });
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

      {connected.length === 0 || uid === null ? null : (
        <Select
          label="Send it to"
          description="Optional. An addressed link also appears on their Workouts screen."
          placeholder="Anyone with the link"
          clearable
          value={toUid}
          onChange={setToUid}
          data={connected.map((edge) => ({
            value: otherUid(edge, uid),
            label: otherName(edge, uid),
          }))}
        />
      )}

      {/*
        A cap the rules cannot enforce (IDEAS §11.1), so it is stated rather
        than hidden: it stops a link being minted on every press until there
        are two hundred, and it does not pretend to stop anyone determined.

        **Nothing is revoked to make room.** A link is something you handed to
        somebody, and quietly killing the oldest one so this press can succeed
        would break it for them with nobody told. So the cap blocks, names what
        is holding it, and lets you choose.
      */}
      {atCap ? (
        <Alert color="orange" variant="light" title="That is a lot of open links">
          <Stack gap="xs">
            <Text size="sm">
              {String(openEverywhere)} links are open across all your workouts, which is the limit.
              Turn one off and you can make another — oldest first, since that is the one least
              likely to still be in use.
            </Text>
            <ShareInventory limit={3} />
          </Stack>
        </Alert>
      ) : null}

      <Group>
        <Button size="compact-sm" loading={busy} disabled={atCap} onClick={() => void share()}>
          {toUid === null
            ? `Create a link to v${String(version.versionNumber)}`
            : `Send v${String(version.versionNumber)}`}
        </Button>
        {openEverywhere === 0 ? null : (
          <Text size="xs" c={remaining <= 3 ? 'orange' : 'dimmed'}>
            {String(openEverywhere)} of {String(MAX_LIVE_SHARES)} links open
            {remaining > 0 && remaining <= 3 ? ` · ${String(remaining)} left` : ''}
          </Text>
        )}
      </Group>

      {isPending || mine.length === 0 ? null : (
        <Stack gap="xs">
          {live.map((entry) => (
            <ShareInventoryRow key={entry.shareId} share={entry} />
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
