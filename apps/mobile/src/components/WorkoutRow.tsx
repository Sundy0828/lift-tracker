import type { Workout } from '@lift/domain/workouts';
import {
  estimateWorkoutSeconds,
  exerciseSlots,
  formatEstimate,
  totalSets,
} from '@lift/domain/workouts';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';
import { Badge, Button, Card, Row } from './ui';
import { usePush } from '../navigation';

/** Starts a session of a workout (see app/(app)/start), once per tap (see `usePush`). */
export function useStartWorkout(): (workoutId: string) => void {
  const push = usePush();
  return (workoutId) => {
    push({ pathname: '/start/[workoutId]', params: { workoutId } });
  };
}

/**
 * One workout in a list: name, size, rough length, and on the Workouts tab
 * its version and what is in it, as the web's cards. Opens the editor.
 *
 * On Today it carries Start; on the Workouts tab it carries Archive, or
 * Restore once archived.
 */
export function WorkoutRow({
  workout,
  defaultRestSeconds,
  startable = false,
  detailed = false,
  onArchive,
  onRestore,
}: {
  workout: Workout;
  defaultRestSeconds: number;
  startable?: boolean;
  /** The version badge and the line of exercise names: the Workouts tab. */
  detailed?: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const push = usePush();
  const startWorkout = useStartWorkout();
  const palette = usePalette();
  const exercises = exerciseSlots(workout.slots);
  const archived = workout.archivedAt !== null;
  return (
    <Card
      testID="workout-option"
      onPress={() => {
        push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } });
      }}
    >
      <View style={styles.row}>
        <View style={styles.text}>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: archived ? palette.dimmed : palette.text }]}
          >
            {workout.name === '' ? 'Untitled workout' : workout.name}
          </Text>
          {archived ? null : (
            <Row>
              <Badge
                label={
                  exercises.length === 1 ? '1 exercise' : `${String(exercises.length)} exercises`
                }
              />
              <Badge label={`${String(totalSets(workout))} sets`} />
              {workout.slots.length === 0 ? null : (
                <Badge
                  label={`~${formatEstimate(estimateWorkoutSeconds(workout, defaultRestSeconds))}`}
                />
              )}
              {detailed ? (
                <Badge
                  tone={workout.currentVersion === 0 ? 'gray' : 'accent'}
                  label={
                    workout.currentVersion === 0
                      ? 'unpublished'
                      : `v${String(workout.currentVersion)}`
                  }
                />
              ) : null}
            </Row>
          )}
          {detailed && !archived && exercises.length > 0 ? (
            <Text numberOfLines={1} style={[styles.small, { color: palette.dimmed }]}>
              {exercises.map((slot) => slot.exerciseName).join(' · ')}
            </Text>
          ) : null}
        </View>
        {startable && exercises.length > 0 ? (
          <Button
            size="compact"
            label="Start"
            onPress={() => {
              startWorkout(workout.id);
            }}
          />
        ) : null}
        {onArchive === undefined || archived ? null : (
          <Button size="compact" variant="subtle" label="Archive" onPress={onArchive} />
        )}
        {onRestore === undefined || !archived ? null : (
          <Button size="compact" variant="subtle" label="Restore" onPress={onRestore} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 12 },
});
