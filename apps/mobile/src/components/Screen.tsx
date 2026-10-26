import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, type NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette } from '../theme';
import { SyncStrip } from './SyncStrip';

/** How far ahead of the end `onNearEnd` fires: about a screenful, as the web's sentinel. */
const NEAR_END = 600;

/** A scrolling page under the sync strip, inside the safe area. */
export function Screen({
  children,
  edges = ['top'],
  onNearEnd,
}: {
  children: ReactNode;
  edges?: ('top' | 'bottom')[];
  /**
   * Called while the end of the page is within a screenful, for a list that
   * loads more as you reach it. Fires on every scroll event there; the caller
   * decides whether it has already asked.
   */
  onNearEnd?: () => void;
}) {
  const palette = usePalette();
  const onScroll =
    onNearEnd === undefined
      ? undefined
      : ({ nativeEvent }: { nativeEvent: NativeScrollEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - NEAR_END) {
            onNearEnd();
          }
        };
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: palette.background }]}>
      <SyncStrip />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={onScroll === undefined ? undefined : 100}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
});
