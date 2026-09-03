import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import { RequireAuth } from './RequireAuth';
import { RouteError } from './RouteError';

/**
 * Every feature area is a lazy route so plan editing, history, and sharing stay
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
        path: 'plans',
        lazy: async () => {
          const { default: Component } = await import('@/features/plans/PlansScreen');
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
