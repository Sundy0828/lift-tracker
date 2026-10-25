import { useAuth } from '@lift/data/hooks/useAuth';
import { useExerciseLibrary } from '@lift/data/hooks/useExerciseLibrary';
import { useFriendEdges } from '@lift/data/hooks/useFriends';
import { useShares } from '@lift/data/hooks/useSharedWorkout';
import { newShareId, publishShare } from '@lift/data/mutations/sharing';
import { friends, otherName, otherUid } from '@lift/domain/friends';
import {
  MAX_LIVE_SHARES,
  buildSharePayload,
  liveShares,
  sharesRemaining,
} from '@lift/domain/sharing';
import type { Workout, WorkoutVersion } from '@lift/domain/workouts';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { shareText, shareUrl } from '../../links';
import { Chip } from '../editor/controls';
import { Body, Button, Notice, Small } from '../ui';
import { ShareInventory, ShareInventoryRow } from './ShareInventory';
import { describeShareError } from './shareError';

/**
 * Publishing a link to a workout, and turning one off: the web's `SharePanel`.
 *
 * A share carries a **published version**, never the working copy: what
 * someone receives must be a snapshot that cannot change under them. So an
 * unpublished workout cannot be shared, and the panel says why.
 *
 * Each press mints a new link rather than rewriting the last, and a link can
 * be addressed to a friend, which only adds it to their Workouts screen.
 *
 * On the phone a new link goes straight to the share sheet: making a link is
 * only ever a step towards sending it.
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
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only connections both sides agreed to.
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
    setNotice(null);
    setError(null);
    try {
      const shareId = await newShareId();
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
      if (toUid === null) shareText(shareUrl(shareId));
      else setNotice('Sent. It is on their Workouts screen now.');
    } catch (cause: unknown) {
      setError(describeShareError(cause, 'Could not create the link'));
    } finally {
      setBusy(false);
    }
  };

  if (version === null) {
    return (
      <Body dimmed>
        Publish a version first. A shared workout is a snapshot someone else can rely on, so there
        has to be one to send.
      </Body>
    );
  }

  return (
    <View style={styles.root}>
      <Body dimmed>
        A link anyone can open, with no account needed to look at it. It carries v
        {String(version.versionNumber)} as it stands now — later edits do not change what a link
        already sent shows.
      </Body>

      {connected.length === 0 || uid === null ? null : (
        <View style={styles.root}>
          <Small>
            Send it to (optional). An addressed link also appears on their Workouts screen.
          </Small>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip
              label="Anyone with the link"
              selected={toUid === null}
              onPress={() => {
                setToUid(null);
              }}
            />
            {connected.map((edge) => {
              const them = otherUid(edge, uid);
              return (
                <Chip
                  key={edge.id}
                  label={otherName(edge, uid)}
                  selected={toUid === them}
                  onPress={() => {
                    setToUid(toUid === them ? null : them);
                  }}
                />
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Nothing is revoked to make room: the cap blocks, names what is
          holding it, and lets you choose. */}
      {atCap ? (
        <Notice tone="orange" title="That is a lot of open links">
          <Body>
            {String(openEverywhere)} links are open across all your workouts, which is the limit.
            Turn one off and you can make another — oldest first, since that is the one least likely
            to still be in use.
          </Body>
          <ShareInventory limit={3} />
        </Notice>
      ) : null}

      {notice === null ? null : (
        <Notice
          tone="success"
          onClose={() => {
            setNotice(null);
          }}
        >
          {notice}
        </Notice>
      )}
      {error === null ? null : <Notice tone="danger">{error}</Notice>}

      <Button
        testID="share-create"
        label={
          toUid === null
            ? `Create a link to v${String(version.versionNumber)}`
            : `Send v${String(version.versionNumber)}`
        }
        busy={busy}
        disabled={atCap}
        onPress={() => void share()}
      />
      {openEverywhere === 0 ? null : (
        <Small>
          {String(openEverywhere)} of {String(MAX_LIVE_SHARES)} links open
          {remaining > 0 && remaining <= 3 ? ` · ${String(remaining)} left` : ''}
        </Small>
      )}

      {isPending || mine.length === 0 ? null : (
        <View style={styles.root}>
          {live.map((entry) => (
            <ShareInventoryRow key={entry.shareId} share={entry} />
          ))}
          {revoked.length === 0 ? null : (
            <Small>
              {revoked.length === 1
                ? '1 link has been turned off.'
                : `${String(revoked.length)} links have been turned off.`}{' '}
              Anyone who opens one is told it was revoked.
            </Small>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  chips: { gap: 8, alignItems: 'center', paddingRight: 16 },
});
