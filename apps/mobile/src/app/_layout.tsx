import { AuthProvider } from '@lift/data/hooks/useAuth';
import { setPlatform } from '@lift/data/platform';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { nativePlatform } from '../platform';
import { ThemeProvider, usePalette } from '../theme';

// Before anything renders, so the session screen's shared hooks find it.
setPlatform(nativePlatform);

/** Inside the theme, so the status bar and the page behind a transition follow it. */
function Root() {
  const palette = usePalette();
  return (
    <>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    // At the root, as gesture-handler requires: the editor's drag-to-reorder
    // and swipe rows are native gestures.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Root />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

/** A screen that throws is replaced by this, not the whole app (see RouteError). */
export { RouteError as ErrorBoundary } from '../components/RouteError';
