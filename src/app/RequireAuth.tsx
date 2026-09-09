import { Center, Loader } from '@mantine/core';
import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';

/**
 * Lazy, like every other feature area: an account that is already confirmed —
 * which is all of them, after the first sign-in — must not pay for this screen
 * in the entry bundle.
 */
const VerifyEmailScreen = lazy(() => import('@/features/auth/VerifyEmailScreen'));

function Waiting({ label }: { label: string }) {
  return (
    <Center h="100dvh">
      <Loader aria-label={label} />
    </Center>
  );
}

/**
 * Gates the app routes.
 *
 * Two gates, in order. Signed-out visitors go to /sign-in with a return path.
 * Signed-in ones whose email is not confirmed get the verification screen
 * instead of the app — every route, not just a banner, so an unconfirmed
 * address cannot accumulate training data that a password reset could never
 * recover.
 *
 * Google accounts arrive verified, so in practice only a fresh password
 * sign-up ever sees the second gate.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, isEmailVerified } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Waiting label="Checking sign-in" />;

  if (status === 'signed-out') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  if (!isEmailVerified) {
    return (
      <Suspense fallback={<Waiting label="Loading" />}>
        <VerifyEmailScreen />
      </Suspense>
    );
  }

  return children;
}
