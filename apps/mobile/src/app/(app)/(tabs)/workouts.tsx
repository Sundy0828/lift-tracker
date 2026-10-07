import { useProfile } from '@lift/data/hooks/useProfile';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { Screen } from '../../../components/Screen';
import { Body, Loading, Title } from '../../../components/ui';
import { WorkoutRow } from '../../../components/WorkoutRow';

/** Every workout, archived ones last. Editing arrives in Phase 4. */
export default function Workouts() {
  const { workouts, isPending } = useWorkouts();
  const { profile } = useProfile();

  if (isPending) return <Loading />;

  const live = workouts.filter((workout) => workout.archivedAt === null);
  const archived = workouts.filter((workout) => workout.archivedAt !== null);

  return (
    <Screen>
      <Title>Workouts</Title>
      {live.map((workout) => (
        <WorkoutRow
          key={workout.id}
          workout={workout}
          defaultRestSeconds={profile.defaultRestSeconds}
        />
      ))}
      {live.length === 0 ? <Body dimmed>No workouts yet. Build one on the web.</Body> : null}
      {archived.length > 0 ? <Body dimmed>Archived</Body> : null}
      {archived.map((workout) => (
        <WorkoutRow
          key={workout.id}
          workout={workout}
          defaultRestSeconds={profile.defaultRestSeconds}
        />
      ))}
    </Screen>
  );
}
