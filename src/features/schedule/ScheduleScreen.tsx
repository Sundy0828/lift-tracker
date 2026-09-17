import {
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { BackTitle } from '@/app/BackTitle';
import { useAuth } from '@/data/hooks/useAuth';
import { useProfile } from '@/data/hooks/useProfile';
import { useSchedule } from '@/data/hooks/useSchedule';
import { useWorkouts } from '@/data/hooks/useWorkouts';
import { saveScheduleDay } from '@/data/mutations/schedule';
import { setScheduleFilter } from '@/data/mutations/profile';
import type { ScheduleDay } from '@/domain/schedule';
import { SCHEDULE_DAYS, isEmpty, prune, weekdayName, workoutsOn } from '@/domain/schedule';
import { dayOfWeekFor } from '@/domain/schedule';
import { localDateKey } from '@/domain/sessions';
import type { Workout } from '@/domain/workouts';

/**
 * The weekly schedule editor: which workouts belong to which day.
 *
 * **It says what a day is for. It does not grade you on it.** There is no
 * compliance figure, no missed-day marker and no rest-day modelling — a
 * schedule that invents the idea of a failed Tuesday is a different product
 * from this one (IDEAS §1.1).
 *
 * Each day is a row of the workouts you own, toggled on or off. Nothing here
 * copies a workout: the document holds ids, so renaming or editing a workout
 * needs no write at all (see `domain/schedule`).
 */
export default function ScheduleScreen() {
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
    // Not awaited, like every other write: Firestore applies it to the local
    // cache and the listener re-renders immediately, online or off.
    void saveScheduleDay(uid, clean, day, next);
  };

  if (workoutsPending || schedulePending) return <Skeleton height={420} radius="md" />;

  if (live.length === 0) {
    return (
      <Stack>
        <BackTitle to="/workouts" title="Weekly plan" />
        <Card withBorder>
          <Stack gap="xs" align="flex-start">
            <Text fw={600}>No workouts to schedule</Text>
            <Text size="sm" c="dimmed">
              A schedule points at workouts you have already built — it never holds a copy of one.
              Build one first and it can go on a day.
            </Text>
            <Button component={Link} to="/workouts" variant="light">
              Build a workout
            </Button>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack>
      <BackTitle to="/workouts" title="Weekly plan" />

      <Text size="sm" c="dimmed">
        Say what each day is for, and Today offers that instead of everything you own. Nothing here
        is a commitment: a day you skip is simply a day you skipped, and nothing on any screen will
        mention it.
      </Text>

      <Card withBorder padding="sm">
        <Switch
          label="Today shows only what is scheduled"
          description="Off: Today lists every workout, with the scheduled ones first."
          checked={profile.scheduleFilter}
          onChange={(event) => {
            if (uid !== null) void setScheduleFilter(uid, event.currentTarget.checked);
          }}
        />
      </Card>

      {SCHEDULE_DAYS.map((day) => {
        const chosen = workoutsOn(clean, day);
        return (
          <Card key={day} withBorder padding="sm" data-testid={`schedule-day-${String(day)}`}>
            <Stack gap="xs">
              <Group gap="xs" align="baseline">
                <Text fw={600}>{weekdayName(day)}</Text>
                {day === todayDay ? (
                  <Badge size="xs" variant="light" color="sky">
                    today
                  </Badge>
                ) : null}
                {chosen.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    rest
                  </Text>
                ) : null}
              </Group>

              <Group gap={6}>
                {live.map((workout) => (
                  <WorkoutChip
                    key={workout.id}
                    workout={workout}
                    selected={chosen.includes(workout.id)}
                    onToggle={() => {
                      toggle(day, workout.id);
                    }}
                  />
                ))}
              </Group>
            </Stack>
          </Card>
        );
      })}

      {isEmpty(clean) ? (
        <Text size="xs" c="dimmed">
          Nothing is scheduled yet, so Today keeps listing everything.
        </Text>
      ) : null}
    </Stack>
  );
}

function WorkoutChip({
  workout,
  selected,
  onToggle,
}: {
  workout: Workout;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = workout.name === '' ? 'Untitled workout' : workout.name;

  return (
    <UnstyledButton onClick={onToggle} aria-pressed={selected} aria-label={name}>
      <Badge
        size="lg"
        variant={selected ? 'filled' : 'outline'}
        color={selected ? 'sky' : 'gray'}
        style={{ cursor: 'pointer' }}
      >
        {name}
      </Badge>
    </UnstyledButton>
  );
}
