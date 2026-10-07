import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

/**
 * The rest countdown as a Live Activity: on the Lock Screen, and in the
 * Dynamic Island on phones that have one. See ./restCountdown for the contract.
 *
 * The clock is SwiftUI's `Text(timerInterval:countsDown:)`, which the system
 * redraws on its own. The app sends one update per rest (and one per ±15 s),
 * never a tick, so it keeps time while the app is suspended.
 *
 * Untested on a device so far: there is no iPhone to run it on yet.
 */

type RestProps = {
  /** Epoch ms. Numbers, not dates: props cross to the widget as JSON. */
  startedAt: number;
  endsAt: number;
  label: string;
};

/**
 * Runs in the widget extension's own JavaScript runtime, not the app's: only
 * `@expo/ui/swift-ui` components, no hooks, nothing from outside this
 * function. Past `endsAt` the system marks it stale and it says so.
 */
function RestActivity(props: RestProps, environment: LiveActivityEnvironment) {
  'widget';
  const ACCENT = '#74c0fc';
  const interval = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };
  const over = environment.isStale === true;
  const clock = (size: number) =>
    over ? (
      <Text modifiers={[font({ size, weight: 'bold' }), foregroundStyle('#ffa94d')]}>0:00</Text>
    ) : (
      <Text
        timerInterval={interval}
        countsDown
        modifiers={[font({ size, weight: 'bold' }), monospacedDigit(), foregroundStyle(ACCENT)]}
      />
    );

  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 })]}>
        <VStack>
          <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>
            {over ? 'Rest is over' : 'Resting'}
          </Text>
          <Text modifiers={[font({ size: 13 })]}>{props.label}</Text>
        </VStack>
        <Spacer />
        {clock(34)}
      </HStack>
    ),
    compactLeading: <Image systemName="timer" color={ACCENT} />,
    compactTrailing: clock(15),
    minimal: <Image systemName="timer" color={ACCENT} />,
    expandedLeading: <Image systemName="timer" color={ACCENT} />,
    expandedTrailing: clock(28),
    expandedBottom: <Text modifiers={[font({ size: 13 })]}>{props.label}</Text>,
  };
}

const RestTimer = createLiveActivity<RestProps>('RestTimer', RestActivity);

let current: LiveActivity<RestProps> | null = null;

/**
 * Ends every rest activity but the current one. An activity outlives the app,
 * so one left by a run that was killed mid-rest is still on the Lock Screen.
 */
function endOrphans(): void {
  for (const instance of RestTimer.getInstances()) {
    if (instance.getId() !== current?.getId()) {
      void instance.end('immediate').catch(() => undefined);
    }
  }
}

export function showRestCountdown(endsAt: number, label: string): void {
  const props: RestProps = { startedAt: Date.now(), endsAt, label };
  // The system de-emphasises it past the deadline; the layout reads that as over.
  const staleDate = new Date(endsAt);
  try {
    if (current === null) {
      endOrphans();
      current = RestTimer.start(props, undefined, staleDate);
    } else {
      void current.update(props, staleDate).catch(() => undefined);
    }
  } catch {
    // Live Activities switched off in Settings. The countdown in the app and
    // the notifications still work.
    current = null;
  }
}

export function hideRestCountdown(): void {
  const ending = current;
  current = null;
  try {
    if (ending !== null) void ending.end('immediate').catch(() => undefined);
    endOrphans();
  } catch {
    // Nothing to end.
  }
}
