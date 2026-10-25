import { Tabs } from 'expo-router';
import { TabIcon, type TabName } from '../../../components/TabIcon';
import { usePalette } from '../../../theme';

const TABS: readonly { name: string; title: string; icon: TabName }[] = [
  { name: 'index', title: 'Today', icon: 'today' },
  { name: 'workouts', title: 'Workouts', icon: 'workouts' },
  { name: 'history', title: 'History', icon: 'history' },
  { name: 'settings', title: 'Settings', icon: 'settings' },
];

/** The web app's bottom nav (`BottomNav.tsx`): Today, Workouts, History, Settings. */
export default function TabsLayout() {
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.dimmed,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => (
              <TabIcon name={tab.icon} color={focused ? palette.accent : palette.dimmed} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
