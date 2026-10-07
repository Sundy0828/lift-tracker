import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useSchedule } from '@lift/data/hooks/useSchedule';
import { useActiveSession } from '@lift/data/hooks/useSession';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { Redirect, Stack } from 'expo-router';
import { Loading } from '../../components/ui';
import { VerifyEmail } from '../../components/VerifyEmail';

/**
 * Keeps the data a gym visit needs subscribed for the whole signed-in session.
 *
 * Each hook opens a Firestore listener. While it is open the native SDK keeps
 * the documents current in its disk cache, so the next launch with no signal
 * still has today's workouts, the schedule and the profile. Tabs that are not
 * on screen would otherwise only fetch when first opened. Renders nothing.
 */
function PrimeCache() {
  useWorkouts();
  useSchedule();
  useProfile();
  useActiveSession();
  return null;
}

/**
 * The same two gates as the web app's `RequireAuth`: signed-out visitors go to
 * sign-in, and an unconfirmed address sees the verification screen instead of
 * the app, so it cannot build up data a password reset could never recover.
 */
export default function AppLayout() {
  const { status, isEmailVerified } = useAuth();

  if (status === 'loading') return <Loading />;
  if (status === 'signed-out') return <Redirect href="/sign-in" />;
  if (!isEmailVerified) return <VerifyEmail />;

  return (
    <>
      <PrimeCache />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
