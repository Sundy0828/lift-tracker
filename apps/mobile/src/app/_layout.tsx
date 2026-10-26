import { AuthProvider, useAuth } from '@lift/data/hooks/useAuth';
import { setPlatform } from '@lift/data/platform';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { listenForRestResponses, nativePlatform } from '../platform';
import { ThemeProvider, usePalette } from '../theme';

// Before anything renders, so the session screen's shared hooks find it.
setPlatform(nativePlatform);

/**
 * "Done resting" pressed with no session screen up, usually because it
 * launched a killed app. The alerts are stopped at once (see
 * `listenForRestResponses`); the session opens once the account is signed in,
 * which on a cold start is after the app's screens are up. Renders nothing.
 */
function RestDone() {
  const { status } = useAuth();
  // An object per press, so a second Done for the same session opens it again.
  const [opening, setOpening] = useState<{ sessionId: string } | null>(null);
  const opened = useRef<{ sessionId: string } | null>(null);

  useEffect(
    () =>
      listenForRestResponses((sessionId) => {
        setOpening({ sessionId });
      }),
    [],
  );

  useEffect(() => {
    // Waits for sign-in, the same gate every session screen sits behind.
    if (opening === null || opened.current === opening || status !== 'signed-in') return;
    opened.current = opening;
    router.navigate({ pathname: '/session/[sessionId]', params: opening });
  }, [opening, status]);

  return null;
}

/** Inside the theme, so the status bar and the page behind a transition follow it. */
function Root() {
  const palette = usePalette();
  return (
    <>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
      <RestDone />
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
