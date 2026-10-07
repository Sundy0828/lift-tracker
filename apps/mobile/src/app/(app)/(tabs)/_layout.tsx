import { Tabs } from 'expo-router';
import { usePalette } from '../../../theme';

/**
 * The web app's bottom nav (`BottomNav.tsx`): Today, Workouts, History,
 * Settings. Labels only for now; icons come with the next native build,
 * since an icon set needs a native font or SVG module.
 */
export default function TabsLayout() {
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.dimmed,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarIcon: () => null,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="workouts" options={{ title: 'Workouts' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
