import { AuthProvider } from '@lift/data/hooks/useAuth';
import { setPlatform } from '@lift/data/platform';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { nativePlatform } from '../platform';

// Before anything renders, so the session screen's shared hooks find it.
setPlatform(nativePlatform);

export default function RootLayout() {
  return (
    // At the root, as gesture-handler requires: the editor's drag-to-reorder
    // and swipe rows are native gestures.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
