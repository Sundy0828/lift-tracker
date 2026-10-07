import type { Workout } from '@lift/domain/workouts';
import { estimateWorkoutSeconds, formatEstimate } from '@lift/domain/workouts';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Card } from './ui';

/** Starts a session of this workout (see app/(app)/start). */
export function startWorkout(workoutId: string): void {
  router.push({ pathname: '/start/[workoutId]', params: { workoutId } });
}

/**
 * One workout in a list: name, size, rough length. Opens its detail. On
 * Today it also carries a Start button, since that is where a session begins.
 */
export function WorkoutRow({
  workout,
  defaultRestSeconds,
  startable = false,
}: {
  workout: Workout;
  defaultRestSeconds: number;
  startable?: boolean;
}) {
  const exercises = workout.slots.filter((slot) => slot.kind === 'exercise').length;
  return (
    <Card
      onPress={() => {
        router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } });
      }}
    >
      <View style={styles.row}>
        <View style={styles.text}>
          <Body>{workout.name}</Body>
          <Body dimmed>
            {String(exercises)} {exercises === 1 ? 'exercise' : 'exercises'} ·{' '}
            {formatEstimate(estimateWorkoutSeconds(workout, defaultRestSeconds))}
          </Body>
        </View>
        {startable && exercises > 0 ? (
          <Button
            label="Start"
            onPress={() => {
              startWorkout(workout.id);
            }}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 4 },
});
