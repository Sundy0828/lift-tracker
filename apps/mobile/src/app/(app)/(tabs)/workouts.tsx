import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { createWorkout, newId } from '@lift/data/mutations/workouts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Screen } from '../../../components/Screen';
import { Body, Button, Field, Loading, Title } from '../../../components/ui';
import { WorkoutRow } from '../../../components/WorkoutRow';
import { usePalette } from '../../../theme';

/** Every workout, archived ones last, and the way to start a new one. */
export default function Workouts() {
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workouts, isPending } = useWorkouts();
  const { profile } = useProfile();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  if (isPending) return <Loading />;

  const live = workouts.filter((workout) => workout.archivedAt === null);
  const archived = workouts.filter((workout) => workout.archivedAt !== null);

  const close = (): void => {
    setCreating(false);
    setName('');
  };

  const create = (): void => {
    const trimmed = name.trim();
    if (uid === null || trimmed === '') return;
    const workoutId = newId();
    // Not awaited: the workout is in the local cache at once, so the editor
    // opens on it even offline.
    void createWorkout(uid, workoutId, trimmed);
    close();
    router.push({ pathname: '/workout/[workoutId]', params: { workoutId } });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.grow}>
          <Title>Workouts</Title>
        </View>
        <Button
          label="New"
          onPress={() => {
            setCreating(true);
          }}
        />
      </View>
      {live.map((workout) => (
        <WorkoutRow
          key={workout.id}
          workout={workout}
          defaultRestSeconds={profile.defaultRestSeconds}
        />
      ))}
      {live.length === 0 ? (
        <Body dimmed>
          No workouts yet. A workout is one named list you actually do: PUSH, ABS, CHEST + DELTS.
          Tap New to build one.
        </Body>
      ) : null}
      {archived.length > 0 ? <Body dimmed>Archived</Body> : null}
      {archived.map((workout) => (
        <WorkoutRow
          key={workout.id}
          workout={workout}
          defaultRestSeconds={profile.defaultRestSeconds}
        />
      ))}

      <Modal visible={creating} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
            <Title>New workout</Title>
            <Field
              label="Workout name"
              placeholder="PUSH"
              autoFocus
              autoCapitalize="characters"
              returnKeyType="done"
              value={name}
              onChangeText={setName}
              onSubmitEditing={create}
            />
            <View style={styles.actions}>
              <View style={styles.grow}>
                <Button variant="subtle" label="Cancel" onPress={close} />
              </View>
              <View style={styles.grow}>
                <Button label="Create" onPress={create} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { padding: 20, gap: 14, borderRadius: 16 },
  actions: { flexDirection: 'row', gap: 12 },
});
