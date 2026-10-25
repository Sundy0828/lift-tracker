import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useSchedule } from '@lift/data/hooks/useSchedule';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { setScheduleFilter } from '@lift/data/mutations/profile';
import { saveScheduleDay } from '@lift/data/mutations/schedule';
import type { ScheduleDay } from '@lift/domain/schedule';
import {
  SCHEDULE_DAYS,
  dayOfWeekFor,
  isEmpty,
  prune,
  weekdayName,
  workoutsOn,
} from '@lift/domain/schedule';
import { localDateKey } from '@lift/domain/sessions';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from '../../components/editor/controls';
import { Screen } from '../../components/Screen';
import {
  BackTitle,
  Badge,
  Body,
  Button,
  Card,
  Heading,
  Loading,
  Row,
  Small,
  SwitchRow,
} from '../../components/ui';

/**
 * The weekly plan: which workouts belong to which day. The web's
 * `ScheduleScreen`.
 *
 * **It says what a day is for. It does not grade you on it.** No compliance
 * figure, no missed-day marker. Each day is a row of the workouts you own,
 * toggled on or off; the document holds ids, so editing a workout needs no
 * write here.
 */
export default function Schedule() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workouts, isPending: workoutsPending } = useWorkouts();
  const { schedule, isPending: schedulePending } = useSchedule();
  const { profile } = useProfile();

  const live = useMemo(() => workouts.filter((workout) => workout.archivedAt === null), [workouts]);
  // Rows pointing at an archived or deleted workout are dropped at read time:
  // a workout can go on another device, so the document alone is not the truth.
  const clean = useMemo(
    () => prune(schedule, new Set(live.map((workout) => workout.id))),
    [schedule, live],
  );
  const todayDay = dayOfWeekFor(localDateKey());

  const toggle = (day: ScheduleDay, workoutId: string): void => {
    if (uid === null) return;
    const current = workoutsOn(clean, day);
    const next = current.includes(workoutId)
      ? current.filter((id) => id !== workoutId)
      : [...current, workoutId];
    // Not awaited: the local cache has it at once, online or off.
    void saveScheduleDay(uid, clean, day, next);
  };

  if (workoutsPending || schedulePending) return <Loading />;

  if (live.length === 0) {
    return (
      <Screen>
        <BackTitle title="Weekly plan" fallback="/workouts" />
        <Card>
          <Heading>No workouts to schedule</Heading>
          <Body dimmed>
            A schedule points at workouts you have already built — it never holds a copy of one.
            Build one first and it can go on a day.
          </Body>
          <Button
            variant="subtle"
            label="Build a workout"
            onPress={() => {
              router.navigate('/workouts');
            }}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackTitle title="Weekly plan" fallback="/workouts" />
      <Body dimmed>
        Say what each day is for, and Today offers that instead of everything you own. Nothing here
        is a commitment: a day you skip is simply a day you skipped, and nothing on any screen will
        mention it.
      </Body>

      <Card>
        <SwitchRow
          label="Today shows only what is scheduled"
          description="Off: Today lists every workout, with the scheduled ones first."
          value={profile.scheduleFilter}
          onChange={(value) => {
            if (uid !== null) void setScheduleFilter(uid, value);
          }}
        />
      </Card>

      {SCHEDULE_DAYS.map((day) => {
        const chosen = workoutsOn(clean, day);
        return (
          <Card key={day} testID={`schedule-day-${String(day)}`}>
            <View style={styles.dayHead}>
              <Heading>{weekdayName(day)}</Heading>
              {day === todayDay ? <Badge tone="accent" label="today" /> : null}
              {chosen.length === 0 ? <Small>rest</Small> : null}
            </View>
            <Row gap={8}>
              {live.map((workout) => {
                const name = workout.name === '' ? 'Untitled workout' : workout.name;
                return (
                  <Chip
                    key={workout.id}
                    label={name}
                    selected={chosen.includes(workout.id)}
                    onPress={() => {
                      toggle(day, workout.id);
                    }}
                  />
                );
              })}
            </Row>
          </Card>
        );
      })}

      {isEmpty(clean) ? (
        <Small>Nothing is scheduled yet, so Today keeps listing everything.</Small>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
});
