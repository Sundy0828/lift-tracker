import { useShares } from '@lift/data/hooks/useSharedWorkout';
import { setShareRevoked } from '@lift/data/mutations/sharing';
import { formatDateWithYear } from '@lift/domain/history';
import type { SharedWorkout } from '@lift/domain/sharing';
import {
  MAX_LIVE_SHARES,
  liveShares,
  liveSharesByAge,
  sharesRemaining,
} from '@lift/domain/sharing';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { shareText, shareUrl } from '../../links';
import { usePalette } from '../../theme';
import { Badge, Body, Button, Card, Heading, Notice, Row, Small } from '../ui';
import { describeShareError } from './shareError';

/**
 * Every link you have open, across every workout: the web's `ShareInventory`.
 *
 * The cap counts all your live links, so the place you hit it is rarely the
 * workout that filled it. Each row names the workout as it was when the link
 * was made, which is also what the recipient sees. Nothing is revoked
 * automatically: taking back a link you handed somebody is a decision.
 */

export function ShareInventoryRow({ share }: { share: SharedWorkout }) {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = shareUrl(share.shareId);
  const name = share.body.name === '' ? 'Untitled workout' : share.body.name;

  const revoke = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await setShareRevoked(share.shareId, true);
    } catch (cause: unknown) {
      setError(describeShareError(cause, 'Could not turn the link off'));
      setBusy(false);
    }
  };

  return (
    <Card testID="share-inventory-row">
      <View style={styles.head}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>
          {name}
        </Text>
        <Badge tone="accent" label={`v${String(share.versionNumber)}`} />
        {share.toUid === null ? null : <Badge label="sent" />}
      </View>
      <Small>
        {share.createdAt === null ? 'Shared' : `Shared ${formatDateWithYear(share.createdAt)}`}
      </Small>
      {/* The link itself: seeing what you are about to send is part of deciding to. */}
      <Small testID="share-url" numberOfLines={1}>
        {url}
      </Small>
      {error === null ? null : <Notice tone="danger">{error}</Notice>}
      <Row gap={8}>
        <Button
          size="compact"
          variant="subtle"
          label="Send link"
          onPress={() => {
            shareText(url);
          }}
        />
        <Button
          size="compact"
          variant="danger-subtle"
          label="Turn off"
          busy={busy}
          onPress={() => void revoke()}
        />
      </Row>
    </Card>
  );
}

/** The whole inventory, oldest first. `limit` trims it for the warning in the share panel. */
export function ShareInventory({ limit }: { limit?: number }) {
  const { shares, isPending } = useShares();
  const open = liveSharesByAge(shares);
  const shown = limit === undefined ? open : open.slice(0, limit);

  if (isPending) return null;

  if (open.length === 0) {
    return <Body dimmed>No links are open. You can make up to {String(MAX_LIVE_SHARES)}.</Body>;
  }

  return (
    <View style={styles.list}>
      {shown.map((share) => (
        <ShareInventoryRow key={share.shareId} share={share} />
      ))}
      {limit !== undefined && open.length > shown.length ? (
        <Small>{String(open.length - shown.length)} more in Settings, under Shared links.</Small>
      ) : null}
    </View>
  );
}

/** Settings' card: every open link in one place, and how near the cap they are. */
export function ShareLinksCard() {
  const palette = usePalette();
  const { shares, isPending } = useShares();
  const open = liveShares(shares).length;
  const remaining = sharesRemaining(shares);

  return (
    <Card>
      <Heading>Shared links</Heading>
      <Body dimmed>
        A link stays open until you turn it off. There is a limit of {String(MAX_LIVE_SHARES)} open
        at once, across every workout — nothing is ever turned off on your behalf to make room,
        because somebody may still be using it.
      </Body>
      {isPending ? null : (
        <>
          <View
            accessibilityLabel="Open links"
            style={[styles.track, { backgroundColor: palette.border }]}
          >
            <View
              style={[
                styles.fill,
                {
                  width: `${String(Math.min(100, (open / MAX_LIVE_SHARES) * 100))}%`,
                  backgroundColor: remaining === 0 ? palette.warn : palette.accent,
                },
              ]}
            />
          </View>
          <Small>
            {String(open)} of {String(MAX_LIVE_SHARES)} open
            {remaining === 0 ? ' — turn one off to make another.' : `, ${String(remaining)} left.`}
          </Small>
        </>
      )}
      <ShareInventory />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  list: { gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
