import { AuthProvider } from '@lift/data/hooks/useAuth';
import { setPlatform } from '@lift/data/platform';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { nativePlatform } from '../platform';

// Before anything renders, so the session screen's shared hooks find it.
setPlatform(nativePlatform);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
