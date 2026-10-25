import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useSchedule } from '@lift/data/hooks/useSchedule';
import { useInbox } from '@lift/data/hooks/useSharedWorkout';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { unschedule } from '@lift/data/mutations/schedule';
import { archiveWorkout, createWorkout, newId } from '@lift/data/mutations/workouts';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Screen } from '../../../components/Screen';
import {
  Badge,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Loading,
  Small,
  Title,
} from '../../../components/ui';
import { WorkoutRow } from '../../../components/WorkoutRow';
import { usePalette } from '../../../theme';
import { usePush } from '../../../navigation';

/** Every workout, archived ones last, and the way to start a new one. */
export default function Workouts() {
  const push = usePush();
  const palette = usePalette();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workouts, isPending } = useWorkouts();
  const { profile } = useProfile();
  const { shares: inbox } = useInbox();
  const { schedule } = useSchedule();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  if (isPending) return <Loading />;

  const live = workouts.filter((workout) => workout.archivedAt === null);
  const archived = workouts.filter((workout) => workout.archivedAt !== null);

  /** Keeps what was typed, as the web's modal does: reopening picks up where it left off. */
  const close = (): void => {
    setCreating(false);
  };

  /**
   * Archiving also takes it off the week, as on the web, so the plan never
   * shows a day that is secretly empty. Restoring does not put it back.
   */
  const archive = (workoutId: string): void => {
    if (uid === null) return;
    void archiveWorkout(uid, workoutId, true);
    void unschedule(uid, schedule, workoutId);
  };

  const create = (): void => {
    const trimmed = name.trim();
    if (uid === null || trimmed === '') return;
    const workoutId = newId();
    // Not awaited: the workout is in the local cache at once, so the editor
    // opens on it even offline.
    void createWorkout(uid, workoutId, trimmed);
    setCreating(false);
    setName('');
    push({ pathname: '/workout/[workoutId]', params: { workoutId } });
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
          detailed
          onArchive={() => {
            archive(workout.id);
          }}
        />
      ))}
      {live.length === 0 ? (
        <Card>
          <Heading>No workouts yet</Heading>
          <Body dimmed>
            A workout is one named list you actually do — PUSH, ABS, CHEST + DELTS. Build them
            separately and do them in whatever combination a day calls for.
          </Body>
          <Button
            variant="subtle"
            label="Create your first workout"
            onPress={() => {
              setCreating(true);
            }}
          />
        </Card>
      ) : null}
      {/* Workouts a friend addressed to you. Nothing is written by listing
          them: each opens the share screen, where importing is a choice. */}
      {inbox.length === 0 ? null : <Heading>Sent to you</Heading>}
      {inbox.map((share) => (
        <Card
          key={share.shareId}
          testID="inbox-row"
          onPress={() => {
            push({ pathname: '/share/[shareId]', params: { shareId: share.shareId } });
          }}
        >
          <View style={styles.header}>
            <View style={styles.grow}>
              <Heading>{share.body.name === '' ? 'Untitled workout' : share.body.name}</Heading>
            </View>
            <Badge tone="accent" label={`v${String(share.versionNumber)}`} />
          </View>
        </Card>
      ))}

      <Card>
        <View style={styles.header}>
          <View style={styles.grow}>
            <Heading>Somewhere to start</Heading>
            <Small>Ready-made workouts to copy, and a weekly plan to put them on.</Small>
          </View>
        </View>
        <View style={styles.actions}>
          <View style={styles.grow}>
            <Button
              size="compact"
              variant="subtle"
              label="Library"
              onPress={() => {
                push('/library');
              }}
            />
          </View>
          <View style={styles.grow}>
            <Button
              size="compact"
              variant="subtle"
              label="Plan"
              onPress={() => {
                push('/schedule');
              }}
            />
          </View>
        </View>
      </Card>

      {archived.length > 0 ? <Body dimmed>Archived</Body> : null}
      {archived.map((workout) => (
        <WorkoutRow
          key={workout.id}
          workout={workout}
          defaultRestSeconds={profile.defaultRestSeconds}
          onRestore={() => {
            if (uid !== null) void archiveWorkout(uid, workout.id, false);
          }}
        />
      ))}

      <Modal visible={creating} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
            <Title>New workout</Title>
            <Field
              testID="workout-name"
              label="Workout name"
              placeholder="PUSH"
              autoFocus
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
                <Button label="Create" disabled={name.trim() === ''} onPress={create} />
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
