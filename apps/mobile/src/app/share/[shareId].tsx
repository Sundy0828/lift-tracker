import { useAuth } from '@lift/data/hooks/useAuth';
import { useSharedWorkout } from '@lift/data/hooks/useSharedWorkout';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { ImportPanel } from '../../components/sharing/ImportPanel';
import { WorkoutPreview } from '../../components/sharing/WorkoutPreview';
import {
  BackTitle,
  Badge,
  Body,
  Button,
  Card,
  Heading,
  Loading,
  Notice,
  Row,
  Title,
} from '../../components/ui';
import { usePalette } from '../../theme';
import { usePush } from '../../navigation';

/**
 * A shared workout: where a share link lands when the app is installed (app
 * links on Android, universal links on iOS), and where the Sent to you rows
 * on Workouts open. The web's `SharedWorkoutScreen`.
 *
 * Outside the signed-in group on purpose, as on the web: a link has to open
 * for someone with no account. Signed out it shows the workout and a way to
 * sign in, which comes back here; signed in it shows the import options.
 * Nothing is written until a path is chosen.
 */
export default function SharedWorkoutScreen() {
  const push = usePush();
  const palette = usePalette();
  const { shareId } = useLocalSearchParams<{ shareId: string }>();
  const { status } = useAuth();
  const { shared, isPending, notFound, revoked } = useSharedWorkout(shareId);

  if (isPending) return <Loading />;

  // Only ever reached by the owner: the rules refuse a revoked share to
  // everybody else, who land in `notFound` and cannot tell the two apart.
  if (revoked) {
    return (
      <Shell>
        <Notice tone="gray" title="This link is turned off">
          You revoked this link, so nobody else can open it. The workout itself is untouched — share
          it again to get a new link.
        </Notice>
      </Shell>
    );
  }

  if (notFound || shared === null) {
    return (
      <Shell>
        <Notice tone="gray" title="This link does not work">
          Either it was mistyped, or the person who shared it has turned it off. Ask them for a new
          one — a revoked link and a wrong one look the same from here, on purpose.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <View style={styles.head}>
        <Text style={[styles.eyebrow, { color: palette.dimmed }]}>SHARED WORKOUT</Text>
        <Title>{shared.body.name === '' ? 'Untitled workout' : shared.body.name}</Title>
        <Row>
          <Badge tone="accent" label={`v${String(shared.versionNumber)}`} />
          {shared.customExercises.length === 0 ? null : (
            <Badge
              label={
                shared.customExercises.length === 1
                  ? '1 custom exercise'
                  : `${String(shared.customExercises.length)} custom exercises`
              }
            />
          )}
        </Row>
      </View>

      <WorkoutPreview body={shared.body} />

      {status === 'signed-in' ? (
        <ImportPanel shared={shared} />
      ) : (
        <Card>
          <Heading>Want to use this?</Heading>
          <Body dimmed>
            Sign in and it can be copied into your own workouts, with every exercise it needs —
            including any the sender made up themselves.
          </Body>
          <Button
            label="Sign in to import"
            onPress={() => {
              // Comes back here after signing in, rather than landing on Today
              // having lost the link that was followed.
              push({ pathname: '/sign-in', params: { from: `/share/${shareId}` } });
            }}
          />
        </Card>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <Screen edges={['top', 'bottom']}>
      <BackTitle title="" fallback="/" />
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  eyebrow: { fontSize: 12, letterSpacing: 0.6 },
});
