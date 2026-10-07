import type { Workout } from '@lift/domain/workouts';
import { estimateWorkoutSeconds, formatEstimate } from '@lift/domain/workouts';
import { router } from 'expo-router';
import { Body, Card } from './ui';

/** One workout in a list: name, size, rough length. Opens its detail. */
export function WorkoutRow({
  workout,
  defaultRestSeconds,
}: {
  workout: Workout;
  defaultRestSeconds: number;
}) {
  const exercises = workout.slots.filter((slot) => slot.kind === 'exercise').length;
  return (
    <Card
      onPress={() => {
        router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } });
      }}
    >
      <Body>{workout.name}</Body>
      <Body dimmed>
        {String(exercises)} {exercises === 1 ? 'exercise' : 'exercises'} ·{' '}
        {formatEstimate(estimateWorkoutSeconds(workout, defaultRestSeconds))}
      </Body>
    </Card>
  );
}
