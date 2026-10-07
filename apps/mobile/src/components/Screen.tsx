import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette } from '../theme';
import { SyncStrip } from './SyncStrip';

/** A scrolling page under the sync strip, inside the safe area. */
export function Screen({
  children,
  edges = ['top'],
}: {
  children: ReactNode;
  edges?: ('top' | 'bottom')[];
}) {
  const palette = usePalette();
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: palette.background }]}>
      <SyncStrip />
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
});
