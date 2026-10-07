import { useProfile } from '@lift/data/hooks/useProfile';
import { useWorkout } from '@lift/data/hooks/useWorkout';
import {
  estimateWorkoutSeconds,
  formatEstimate,
  formatPrescription,
  formatRestSeconds,
} from '@lift/domain/workouts';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../components/Screen';
import { Body, Button, Card, Loading, Title } from '../../../components/ui';
import { startWorkout } from '../../../components/WorkoutRow';

/**
 * One workout, read-only: its slots as the working copy has them now, and the
 * button that starts it. Editing (and drag-to-reorder) arrives in Phase 4.
 */
export default function WorkoutDetail() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const { workout, isPending, notFound } = useWorkout(workoutId);
  const { profile } = useProfile();

  if (isPending) return <Loading />;

  if (notFound || workout === null) {
    return (
      <Screen>
        <Title>Workout not found</Title>
        <Body dimmed>It may have been deleted on another device.</Body>
        <Button
          variant="subtle"
          label="Back"
          onPress={() => {
            router.back();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Button
        variant="subtle"
        label="Back"
        onPress={() => {
          router.back();
        }}
      />
      <Title>{workout.name}</Title>
      <Body dimmed>
        About {formatEstimate(estimateWorkoutSeconds(workout, profile.defaultRestSeconds))}
        {workout.currentVersion > 0 ? ` · version ${String(workout.currentVersion)}` : ''}
      </Body>
      {workout.notes === '' ? null : <Body>{workout.notes}</Body>}

      {workout.slots.some((slot) => slot.kind === 'exercise') ? (
        <Button
          label="Start this workout"
          onPress={() => {
            startWorkout(workout.id);
          }}
        />
      ) : null}

      {workout.slots.map((slot) =>
        slot.kind === 'rest' ? (
          <Body key={slot.slotId} dimmed>
            Rest {formatRestSeconds(slot.prescription.restSeconds ?? profile.defaultRestSeconds)}
          </Body>
        ) : (
          <Card key={slot.slotId}>
            <Body>{slot.exerciseName}</Body>
            <Body dimmed>
              {formatPrescription(slot.prescription)}
              {slot.supersetGroup === null ? '' : ' · circuit'}
            </Body>
            {slot.notes === '' ? null : <Body dimmed>{slot.notes}</Body>}
          </Card>
        ),
      )}

      {workout.slots.length === 0 ? <Body dimmed>No exercises yet.</Body> : null}
    </Screen>
  );
}
