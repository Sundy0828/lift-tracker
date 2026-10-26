import type { Platform } from '@lift/data/platform';
import { restAlertOffsets } from '@lift/domain/rest';
import * as Notifications from 'expo-notifications';
import { AppState, Platform as OS } from 'react-native';
import { hideRestCountdown, showRestCountdown } from './restCountdown';

/**
 * The phone's side of `@lift/data/platform`.
 *
 * **Every alert is scheduled with the OS up front.** On the web a service
 * worker fires the repeats one after another; here the app is not running
 * once the phone is locked, so all of `restAlertOffsets` is handed to the OS
 * at once. The OS delivers each one whether the app is suspended, killed or
 * the screen is off.
 *
 * Rest alerts are the only notifications this app schedules, so cancelling
 * cancels *everything*. That is deliberate: it also clears the alerts of a rest
 * scheduled before the app was killed, whose identifiers died with it.
 */

const CHANNEL = 'rest';
const CATEGORY = 'rest';

/** The action button on the notification. Handled in `onRestDone`. */
export const REST_DONE_ACTION = 'done';

/** Long-short-long, the web's pattern. Android's first number is a delay. */
export const REST_VIBRATION = [0, 180, 90, 180, 90, 300];

/**
 * In the foreground the session screen raises its own alert (vibration and
 * chime), so the OS banner would be a second, noisier copy of the same thing.
 */
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
});

let setup: Promise<void> | null = null;

/**
 * The Android channel and the Done button, registered once.
 *
 * The channel has to exist before the permission prompt on Android 13+, which
 * is why this runs ahead of the first request rather than at launch.
 *
 * Done opens the app: it is pressed on the way to the next set, and the screen
 * has to record how long the rest ran, which needs the app running.
 */
function ensureSetup(): Promise<void> {
  setup ??= (async () => {
    if (OS.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: REST_VIBRATION,
        enableVibrate: true,
      });
    }
    await Notifications.setNotificationCategoryAsync(CATEGORY, [
      {
        identifier: REST_DONE_ACTION,
        buttonTitle: 'Done resting',
        options: { opensAppToForeground: true },
      },
    ]);
  })().catch((error: unknown) => {
    // Tried again on the next rest, rather than every rest failing after one.
    setup = null;
    throw error;
  });
  return setup;
}

let denied = false;

/** True once the user has refused notifications. The countdown still works. */
export function restAlarmDenied(): boolean {
  return denied;
}

/**
 * Asks the first time a rest starts, never at launch: a prompt before the app
 * has done anything is the quickest way to a permanent no.
 */
async function canNotify(): Promise<boolean> {
  await ensureSetup();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    // Switched on in Settings since it was refused.
    denied = false;
    return true;
  }
  if (!current.canAskAgain) {
    denied = true;
    return false;
  }
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  denied = !asked.granted;
  return asked.granted;
}

async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}

/** The session the rests being scheduled belong to; goes into each alert. */
let restSessionId: string | null = null;

/** Set by the session screen, so Done can find its way back to it. */
export function setRestSession(sessionId: string | null): void {
  restSessionId = sessionId;
}

async function schedule(
  endsAt: number,
  body: string,
  tag: string,
  sessionId: string | null,
): Promise<void> {
  const allowed = await canNotify();
  await cancelAll();
  // After the cancel, which on Android dismisses every notification of the
  // app, this one included. A Live Activity needs no notification
  // permission, so it is shown either way.
  showRestCountdown(endsAt, body);
  if (!allowed) return;

  for (const [round, offset] of restAlertOffsets().entries()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: round === 0 ? 'Rest is over' : 'Still resting',
        // A buzz with nothing to look at is worse than nothing, so it names
        // what is next.
        body,
        sound: 'default',
        categoryIdentifier: CATEGORY,
        // A Focus mode would otherwise hold it back until later, which for a
        // rest timer is the same as never. The silent switch still mutes the
        // sound; the vibration and the banner get through.
        interruptionLevel: 'timeSensitive',
        vibrate: REST_VIBRATION,
        // Read back by `scheduledRestEndsAt` after the app is killed, and by
        // `listenForRestResponses` to reopen the session from Done.
        data: { kind: 'rest', endsAt, tag, sessionId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(endsAt + offset * 1000),
        channelId: CHANNEL,
        // Android: an alarm-clock alarm, which the system never defers. The
        // default exact alarm arrived ~20 s late in testing, and battery
        // savers on some phones push it back by minutes. Needs
        // USE_EXACT_ALARM (app.json); without it Android falls back to an
        // inexact alarm. Also puts an alarm icon in the status bar until the
        // rest ends.
        delivery: 'alarmClock',
      },
    });
  }
}

/**
 * One call at a time. A rest adjusted twice in quick succession would
 * otherwise interleave a cancel with a schedule and leave stale alerts behind.
 */
let queue: Promise<void> = Promise.resolve();

function serially(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task).catch(() => {
    // A refused or failed notification costs the alert, not the countdown.
  });
  queue = next;
  return next;
}

export const nativePlatform: Platform = {
  scheduleRestAlarm: (endsAt, body, tag) => {
    // Read now, not when the queue gets to it.
    const sessionId = restSessionId;
    return serially(() => schedule(endsAt, body, tag, sessionId));
  },
  cancelRestAlarm: () =>
    serially(async () => {
      hideRestCountdown();
      await cancelAll();
    }),

  onBackground(listener) {
    const subscription = AppState.addEventListener('change', (state) => {
      // 'inactive' too: an app swiped away in the iOS app switcher is killed
      // from there, without ever reaching 'background'.
      if (state === 'background' || state === 'inactive') listener();
    });
    return () => {
      subscription.remove();
    };
  },

  onForeground(listener) {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') listener();
    });
    return () => {
      subscription.remove();
    };
  },
};

const doneListeners = new Set<() => void>();

/**
 * Calls `listener` when Done is pressed on a rest notification. The app is
 * brought to the foreground for it (see `ensureSetup`). Fed by
 * `listenForRestResponses`, which handles Done itself while nobody listens.
 */
export function onRestDone(listener: () => void): () => void {
  doneListeners.add(listener);
  return () => {
    doneListeners.delete(listener);
  };
}

/**
 * Cancels the rest alarm if it belongs to `sessionId`, for a session discarded
 * from Today. Only one rest is ever scheduled, but it may be another unfinished
 * session's, left by a killed run; that one is kept. An alarm from before
 * alerts carried their session cannot be told apart, and is cancelled.
 */
export function cancelRestAlarmFor(sessionId: string): Promise<void> {
  return serially(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const other = scheduled.some((request) => {
      const data = request.content.data as Record<string, unknown> | null;
      const owner = data?.['sessionId'];
      return data?.['kind'] === 'rest' && typeof owner === 'string' && owner !== sessionId;
    });
    if (other) return;
    hideRestCountdown();
    await cancelAll();
  });
}

/** Done pressed with no session screen up, by rest tag: when it was pressed. */
const doneWhileAway = new Map<string, number>();

/**
 * When Done was pressed for this rest while its screen was not up (the app
 * had been killed), or null. Read once: the screen records the rest from it.
 */
export function takeRestDone(tag: string): number | null {
  const at = doneWhileAway.get(tag) ?? null;
  doneWhileAway.delete(tag);
  return at;
}

/** The last response handled, so the one that launched the app is not taken twice. */
let handled: string | null = null;

function handleResponse(
  response: Notifications.NotificationResponse,
  open: (sessionId: string) => void,
): void {
  if (response.actionIdentifier !== REST_DONE_ACTION) return;
  const id = response.notification.request.identifier;
  if (handled === id) return;
  handled = id;

  if (doneListeners.size > 0) {
    for (const listener of doneListeners) listener();
    return;
  }
  // No session screen to end the rest, so the follow-up alerts are stopped
  // here, at once, and the screen is told when it opens.
  void nativePlatform.cancelRestAlarm();
  const data = response.notification.request.content.data as Record<string, unknown> | null;
  if (typeof data?.['tag'] === 'string') doneWhileAway.set(data['tag'], Date.now());
  if (typeof data?.['sessionId'] === 'string') open(data['sessionId']);
}

/**
 * Handles Done for the whole app, from the root. The session screen is not
 * mounted when Done launches a killed app, and the response that launched it
 * is only read back here, never delivered to a listener added later. `open`
 * is asked to show the rest's session.
 */
export function listenForRestResponses(open: (sessionId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleResponse(response, open);
  });
  try {
    const launched = Notifications.getLastNotificationResponse();
    if (launched !== null) handleResponse(launched, open);
  } catch {
    // Unreadable: that Done is lost, and its alerts run their course.
  }
  return () => {
    subscription.remove();
  };
}

/**
 * The deadline of a rest still scheduled with the OS, as last set in the app:
 * −15s/+15s included. Null when none is pending for that set, for example
 * because notifications are off; the caller then falls back to the planned rest.
 *
 * The scheduled alerts are the only record of an adjusted rest that survives
 * the app being killed, so this is what lets it resume as it was.
 */
export async function scheduledRestEndsAt(tag: string): Promise<number | null> {
  try {
    for (const request of await Notifications.getAllScheduledNotificationsAsync()) {
      const data = request.content.data as Record<string, unknown> | null;
      if (data?.['kind'] === 'rest' && data['tag'] === tag && typeof data['endsAt'] === 'number') {
        return data['endsAt'];
      }
    }
  } catch {
    // Unreadable: fall back to the planned rest.
  }
  return null;
}
