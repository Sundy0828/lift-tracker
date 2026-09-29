/**
 * The rest timer's notification, from the page's side.
 *
 * Permission is requested **lazily, on first use** — the first time a rest
 * timer actually starts — rather than on load. A permission prompt before the
 * app has done anything is the fastest way to get denied permanently, and
 * denial is the one state that cannot be undone from inside the app.
 *
 * Everything here degrades to nothing: no service worker, no Notification API,
 * or a denied prompt all leave the on-screen countdown working. Nothing in the
 * logging flow may depend on a notification arriving.
 */

export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationState(): NotificationState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';

  const permission = Notification.permission;
  return permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'default';
}

/**
 * Asks for permission if it has not been decided, and reports whether the
 * notification can be delivered. Never throws: a browser that rejects the
 * request is the same outcome as a user declining it.
 */
export async function requestRestNotifications(): Promise<boolean> {
  const state = notificationState();
  if (state === 'granted') return true;
  if (state !== 'default') return false;

  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

async function postToWorker(message: Record<string, unknown>): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    // `ready` rather than `controller`: on the very first load the page is not
    // yet controlled, and the worker can still hold the timeout.
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage(message);
  } catch {
    // A worker that will not take the message costs the notification, not the
    // countdown.
  }
}

/**
 * Hands the deadline to the service worker.
 *
 * The worker owns the timeout because the page's timers are frozen once the
 * screen goes off, which is the situation the notification exists for. The
 * page keeps its own countdown for the on-screen readout.
 */
export async function scheduleRestNotification(endsAt: number, body: string): Promise<void> {
  if (!(await requestRestNotifications())) return;
  await postToWorker({ type: 'REST_TIMER_START', endsAt, body });
}

/** Called when a rest is skipped, restarted, or the session ends. */
export async function cancelRestNotification(): Promise<void> {
  if (notificationState() !== 'granted') return;
  await postToWorker({ type: 'REST_TIMER_CANCEL' });
}
