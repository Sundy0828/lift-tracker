import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { RouteError } from './RouteError';

/**
 * Every feature area is a lazy route so workout editing, history, and sharing stay
 * out of the entry bundle (§3). `lazy` resolves the module on navigation and
 * the layout's <Suspense> covers the gap.
 *
 * Each screen carries its own `errorElement`. Without one the nearest boundary
 * is the layout route's, so a single failed chunk would replace the whole
 * shell — bottom navigation included — and leave no way out but the back
 * button. Owned by the screen, the error renders inside the Outlet and the app
 * around it keeps working.
 */

type Load = () => Promise<{ default: ComponentType }>;

/** A lazy screen that fails inside the shell rather than taking it down. */
function screen(load: Load): Pick<RouteObject, 'lazy' | 'errorElement'> {
  return {
    lazy: async () => ({ Component: (await load()).default }),
    errorElement: <RouteError />,
  };
}

const routes: RouteObject[] = [
  {
    path: '/sign-in',
    ...screen(() => import('@/features/auth/SignInScreen')),
  },
  {
    /**
     * The one public route (§2.9). Outside `RequireAuth` deliberately: a share
     * link has to open for someone with no account, which is what sharing is
     * for. It renders its own shell rather than the signed-in layout, so
     * nothing on it assumes a user.
     */
    path: '/share/:shareId',
    ...screen(() => import('@/features/sharing/SharedWorkoutScreen')),
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
      { index: true, ...screen(() => import('@/features/today/TodayScreen')) },
      { path: 'exercises', ...screen(() => import('@/features/exercises/ExercisesScreen')) },
      { path: 'workouts', ...screen(() => import('@/features/workouts/WorkoutsScreen')) },
      {
        path: 'workouts/:workoutId',
        ...screen(() => import('@/features/workouts/WorkoutEditorScreen')),
      },
      {
        // Starts a session and redirects; its own route because it has to load
        // the workout's version history first (see StartSessionScreen).
        path: 'session/start/:workoutId',
        ...screen(() => import('@/features/logging/StartSessionScreen')),
      },
      {
        path: 'session/:sessionId',
        ...screen(() => import('@/features/logging/ActiveSessionScreen')),
      },
      { path: 'history', ...screen(() => import('@/features/history/HistoryScreen')) },
      {
        // The archaeology view: one past session against the workout snapshot
        // it was performed against.
        path: 'history/session/:sessionId',
        ...screen(() => import('@/features/history/SessionDetailScreen')),
      },
      {
        // Its own route because it is the one screen that queries `sessions`
        // directly, and it must stay off the logging path (§2.6).
        path: 'history/exercise/:exerciseId',
        ...screen(() => import('@/features/history/ExerciseHistoryScreen')),
      },
      { path: 'settings', ...screen(() => import('@/features/settings/SettingsScreen')) },
      {
        // A real 404. This used to render Today, which quietly turned a
        // mistyped or stale link into "your session is missing".
        path: '*',
        ...screen(() => import('@/features/errors/NotFoundScreen')),
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
