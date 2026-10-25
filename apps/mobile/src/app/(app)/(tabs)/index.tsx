import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { useSchedule } from '@lift/data/hooks/useSchedule';
import { useActiveSession } from '@lift/data/hooks/useSession';
import { useWorkouts } from '@lift/data/hooks/useWorkouts';
import { setTourVersion } from '@lift/data/mutations/profile';
import { abandonSession, newSessionId, startSession } from '@lift/data/mutations/sessions';
import { dayOfWeekFor, scheduledOn, weekdayName } from '@lift/domain/schedule';
import type { Session } from '@lift/domain/sessions';
import { localDateKey, sessionProgress } from '@lift/domain/sessions';
import { TOUR_VERSION } from '@lift/domain/tour';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { UserAvatar } from '../../../components/Avatar';
import { Screen } from '../../../components/Screen';
import { SessionClock } from '../../../components/session/SessionClock';
import { Tour } from '../../../components/Tour';
import {
  Body,
  Button,
  Card,
  Heading,
  Loading,
  Notice,
  Row,
  Small,
  Title,
} from '../../../components/ui';
import { WorkoutRow } from '../../../components/WorkoutRow';
import { usePush } from '../../../navigation';

/** One unfinished session, with its own resume and its own two-tap discard. */
function ResumeItem({
  session,
  newest,
  armed,
  onArm,
  onDiscard,
}: {
  session: Session;
  /** The newest is shown first and in colour. */
  newest: boolean;
  armed: boolean;
  onArm: (armed: boolean) => void;
  onDiscard: () => void;
}) {
  const push = usePush();
  const progress = sessionProgress(session.entries);
  const startedToday = session.performedOn === localDateKey();

  return (
    <Notice
      tone={newest ? 'accent' : 'gray'}
      title={newest ? 'Session in progress' : 'Unfinished session'}
    >
      <View testID="resume-item" style={styles.resume}>
        <Body>
          {session.workoutName} · {String(progress.completed)} of {String(progress.total)} sets
        </Body>
        <Row>
          <SessionClock session={session} />
          {startedToday ? null : <Small>· started {session.performedOn}</Small>}
        </Row>
        {startedToday ? null : (
          <Small>
            Started on another day. Resume it if you are still going, or discard it — its numbers
            are not counted in any history until it is finished.
          </Small>
        )}
        <Row gap={8}>
          <Button
            size="compact"
            label="Resume"
            onPress={() => {
              push({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
            }}
          />
          {/* Two taps, as on the session screen: this throws away logged
              sets and there is no undo. */}
          {armed ? (
            <>
              <Button
                size="compact"
                variant="danger"
                label="Discard for good"
                onPress={onDiscard}
              />
              <Button
                size="compact"
                variant="subtle"
                label="Keep it"
                onPress={() => {
                  onArm(false);
                }}
              />
            </>
          ) : (
            <Button
              size="compact"
              variant="danger-subtle"
              label="Discard"
              onPress={() => {
                onArm(true);
              }}
            />
          )}
        </Row>
      </View>
    </Notice>
  );
}

/**
 * Today: sessions still in progress first, then what today is for, then
 * everything else you have built, then an ad-hoc session. The web's
 * `TodayScreen`.
 *
 * A schedule says what a day is *for*, never what you missed, and a schedule
 * row whose workout was deleted elsewhere is skipped rather than shown dead.
 */
export default function Today() {
  const push = usePush();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { workouts, isPending } = useWorkouts();
  const { sessions: unfinished } = useActiveSession();
  const { profile, isPending: profilePending } = useProfile();
  const { schedule } = useSchedule();
  const [showRest, setShowRest] = useState(false);
  const [armedId, setArmedId] = useState<string | null>(null);
  // Shown once per account, on first arrival, as on the web. Local state hides
  // it at once; the profile write is what keeps it away on every device.
  const [tourDone, setTourDone] = useState(false);
  const showTour = !profilePending && !tourDone && profile.tourVersion < TOUR_VERSION;

  if (isPending) return <Loading />;

  const today = localDateKey();
  const live = workouts.filter((workout) => workout.archivedAt === null);
  const todayIds = scheduledOn(schedule, today);
  const scheduled = live.filter((workout) => todayIds.includes(workout.id));
  const rest = live.filter((workout) => !todayIds.includes(workout.id));
  const dayOfWeek = dayOfWeekFor(today);
  // A plan only takes over the screen when there is one for today and you
  // asked it to (Plan > "Today shows only what is scheduled"). Otherwise the
  // planned workouts simply come first.
  const planned = profile.scheduleFilter && scheduled.length > 0;

  /** Not awaited: a session with nothing logged is deleted, never reaching history. */
  const discard = (session: Session): void => {
    if (uid === null) return;
    setArmedId(null);
    void abandonSession(uid, session);
  };

  const startAdHoc = (): void => {
    if (uid === null) return;
    const { session, promise } = startSession(uid, {
      sessionId: newSessionId(),
      workoutId: null,
      workoutVersion: null,
      workoutName: 'Ad-hoc session',
      body: null,
    });
    // Not awaited: in the local cache at once, so the session opens offline.
    void promise;
    push({ pathname: '/session/[sessionId]', params: { sessionId: session.id } });
  };

  return (
    <Screen>
      <View style={styles.titleRow}>
        <Title>Today</Title>
        {/* You, at a glance; opens Settings, where the name and photo come from. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings and profile"
          hitSlop={8}
          onPress={() => {
            router.navigate('/settings');
          }}
        >
          <UserAvatar />
        </Pressable>
      </View>
      {dayOfWeek === null ? null : <Body dimmed>{weekdayName(dayOfWeek)}</Body>}

      {unfinished.length > 1 ? (
        <Small>
          {String(unfinished.length)} sessions were never finished. Resume or discard any one of
          them on its own.
        </Small>
      ) : null}
      {unfinished.map((session, index) => (
        <ResumeItem
          key={session.id}
          session={session}
          newest={index === 0}
          armed={armedId === session.id}
          onArm={(armed) => {
            setArmedId(armed ? session.id : null);
          }}
          onDiscard={() => {
            discard(session);
          }}
        />
      ))}

      {live.length === 0 ? (
        <Card>
          <Heading>No workouts yet</Heading>
          <Body dimmed>
            A workout is one reusable list — PUSH, PULL, ABS. Build one and it is here every time.
          </Body>
          <Button
            variant="subtle"
            label="Build a workout"
            onPress={() => {
              router.navigate('/workouts');
            }}
          />
        </Card>
      ) : (
        <>
          <Heading>
            {planned && dayOfWeek !== null
              ? `${weekdayName(dayOfWeek)} — what you planned`
              : 'Start a workout'}
          </Heading>
          {(planned ? scheduled : [...scheduled, ...rest]).map((workout) => (
            <WorkoutRow
              key={workout.id}
              workout={workout}
              defaultRestSeconds={profile.defaultRestSeconds}
              startable
            />
          ))}

          {/* Everything else, one tap away rather than gone: a workout you
              forgot to put on a day is still one you might do today. */}
          {planned && rest.length > 0 ? (
            <Pressable
              testID="show-rest"
              accessibilityRole="button"
              accessibilityState={{ expanded: showRest }}
              hitSlop={8}
              onPress={() => {
                setShowRest((open) => !open);
              }}
            >
              <Small>
                {showRest ? '▾ Hide' : '▸ Show'} the other {String(rest.length)}
                {rest.length === 1 ? ' workout' : ' workouts'}
              </Small>
            </Pressable>
          ) : null}
          {planned && showRest
            ? rest.map((workout) => (
                <WorkoutRow
                  key={workout.id}
                  workout={workout}
                  defaultRestSeconds={profile.defaultRestSeconds}
                  startable
                />
              ))
            : null}
        </>
      )}

      <Card>
        <Heading>Something else</Heading>
        <Small>
          An ad-hoc session logs whatever you feel like doing. It feeds each exercise&apos;s own
          history, but no workout&apos;s — there is no workout for it to belong to.
        </Small>
        <Button variant="subtle" label="Start an ad-hoc session" onPress={startAdHoc} />
      </Card>

      <Tour
        visible={showTour}
        onClose={() => {
          setTourDone(true);
          if (uid !== null) void setTourVersion(uid, TOUR_VERSION);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resume: { gap: 6 },
});
