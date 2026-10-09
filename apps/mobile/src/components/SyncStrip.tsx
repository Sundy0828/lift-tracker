import { useSyncState } from '@lift/data/hooks/useSyncState';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';

/**
 * The web app's sync strip, same rules (see `apps/web/src/app/SyncStrip.tsx`):
 * statements of fact, never a warning, and nothing at all once synced.
 *
 * "Offline" here is Firestore's own view (every open listener answering from
 * cache) rather than the OS network state. That needs no extra native module,
 * and it is the more honest signal anyway: it says the server has not
 * answered, which is what the strip is about.
 */
export function SyncStrip() {
  const palette = usePalette();
  const { pending, offline } = useSyncState();

  if (!offline && !pending) return null;

  const message = offline
    ? pending
      ? 'Offline — your changes are saved on this phone and will sync when you reconnect'
      : 'Offline — showing what is saved on this phone'
    : 'Saved on this phone — syncing now';

  return (
    <View
      style={[styles.strip, { backgroundColor: offline ? palette.offline : palette.syncing }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.text, { color: offline ? palette.offlineText : palette.syncingText }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { paddingHorizontal: 16, paddingVertical: 6 },
  text: { fontSize: 12 },
});
