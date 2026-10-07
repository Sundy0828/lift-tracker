import { useProfile } from '@lift/data/hooks/useProfile';
import { useSchedule } from '@lift/data/hooks/useSchedule';
import { useActiveSession } from '@lift/data/hooks/useSession';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { dayOfWeekFor, scheduledOn, weekdayName } from '@lift/domain/schedule';
import { localDateKey, sessionProgress } from '@lift/domain/sessions';
import { Screen } from '../../../components/Screen';
import { Body, Card, Loading, Title } from '../../../components/ui';
import { WorkoutRow } from '../../../components/WorkoutRow';

/**
 * Today, read-only for Phase 2: what today is for, and everything else you
 * have built. Starting and logging a session arrive in Phase 3.
 *
 * Same rules as the web Today screen: a schedule says what a day is *for*,
 * never what you missed, and a schedule row whose workout was deleted
 * elsewhere is skipped rather than shown as a dead entry.
 */
export default function Today() {
  const { workouts, isPending } = useWorkouts();
  const { sessions: unfinished } = useActiveSession();
  const { profile } = useProfile();
  const { schedule } = useSchedule();

  if (isPending) return <Loading />;

  const today = localDateKey();
  const live = workouts.filter((workout) => workout.archivedAt === null);
  const todayIds = scheduledOn(schedule, today);
  const scheduled = live.filter((workout) => todayIds.includes(workout.id));
  const rest = live.filter((workout) => !todayIds.includes(workout.id));
  const dayOfWeek = dayOfWeekFor(today);

  return (
    <Screen>
      <Title>Today</Title>
      {dayOfWeek === null ? null : <Body dimmed>{weekdayName(dayOfWeek)}</Body>}

      {unfinished.map((session) => {
        const progress = sessionProgress(session.entries);
        return (
          <Card key={session.id}>
            <Body>In progress: {session.workoutName}</Body>
            <Body dimmed>
              {String(progress.completed)} of {String(progress.total)} sets logged. Logging in the
              app arrives in the next update; finish this one on the web for now.
            </Body>
          </Card>
        );
      })}

      {scheduled.length > 0 ? <Body dimmed>Planned for today</Body> : null}
      {scheduled.map((workout) => (
        <WorkoutRow
          key={workout.id}
          workout={workout}
          defaultRestSeconds={profile.defaultRestSeconds}
        />
      ))}

      {scheduled.length > 0 && rest.length > 0 ? <Body dimmed>Everything else</Body> : null}
      {rest.map((workout) => (
        <WorkoutRow
          key={workout.id}
          workout={workout}
          defaultRestSeconds={profile.defaultRestSeconds}
        />
      ))}

      {live.length === 0 ? (
        <Body dimmed>No workouts yet. Build one on the web; it shows up here.</Body>
      ) : null}
    </Screen>
  );
}
