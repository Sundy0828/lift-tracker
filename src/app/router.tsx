import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { RouteError } from './RouteError';

/**
 * Every feature area is a lazy route so workout editing, history, and sharing stay
 * out of the entry bundle (§3). `lazy` resolves the module on navigation and
 * the layout's <Suspense> covers the gap.
 */
const routes: RouteObject[] = [
  {
    path: '/sign-in',
    lazy: async () => {
      const { default: Component } = await import('@/features/auth/SignInScreen');
      return { Component };
    },
    errorElement: <RouteError />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { default: Component } = await import('@/features/today/TodayScreen');
          return { Component };
        },
      },
      {
        path: 'exercises',
        lazy: async () => {
          const { default: Component } = await import('@/features/exercises/ExercisesScreen');
          return { Component };
        },
      },
      {
        path: 'workouts',
        lazy: async () => {
          const { default: Component } = await import('@/features/workouts/WorkoutsScreen');
          return { Component };
        },
      },
      {
        path: 'workouts/:workoutId',
        lazy: async () => {
          const { default: Component } = await import('@/features/workouts/WorkoutEditorScreen');
          return { Component };
        },
      },
      {
        // Starts a session and redirects; its own route because it has to load
        // the workout's version history first (see StartSessionScreen).
        path: 'session/start/:workoutId',
        lazy: async () => {
          const { default: Component } = await import('@/features/logging/StartSessionScreen');
          return { Component };
        },
      },
      {
        path: 'session/:sessionId',
        lazy: async () => {
          const { default: Component } = await import('@/features/logging/ActiveSessionScreen');
          return { Component };
        },
      },
      {
        path: 'history',
        lazy: async () => {
          const { default: Component } = await import('@/features/history/HistoryScreen');
          return { Component };
        },
      },
      {
        // The archaeology view: one past session against the workout snapshot
        // it was performed against.
        path: 'history/session/:sessionId',
        lazy: async () => {
          const { default: Component } = await import('@/features/history/SessionDetailScreen');
          return { Component };
        },
      },
      {
        // Its own route because it is the one screen that queries `sessions`
        // directly, and it must stay off the logging path (§2.6).
        path: 'history/exercise/:exerciseId',
        lazy: async () => {
          const { default: Component } = await import('@/features/history/ExerciseHistoryScreen');
          return { Component };
        },
      },
      {
        path: 'settings',
        lazy: async () => {
          const { default: Component } = await import('@/features/settings/SettingsScreen');
          return { Component };
        },
      },
      {
        path: '*',
        lazy: async () => {
          const { default: Component } = await import('@/features/today/TodayScreen');
          return { Component };
        },
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
