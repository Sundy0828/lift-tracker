/**
 * What the shared hooks need from the device, and nothing else.
 *
 * The rest timer and the session draft behave the same on the web and on a
 * phone. Only a few things differ: how the end of a rest is announced with the
 * screen off (a service worker on the web, an OS-scheduled notification on a
 * phone), and how the app learns that it was put away or brought back (page
 * visibility on the web, `AppState` on a phone).
 *
 * Each app registers its implementation once, at startup, with `setPlatform`.
 * Until then, and in unit tests, every call is a no-op: the countdown on
 * screen and the debounced write both still work, which is the rule anyway.
 * Nothing in the logging flow may depend on a notification arriving.
 */
export type Platform = {
  /**
   * Announces the end of a rest at `endsAt` (epoch ms), and repeats it as
   * `restAlertOffsets` says. Replaces any rest already scheduled. Asks for
   * permission the first time, never earlier.
   *
   * `tag` names the set the rest belongs to (`restTag` in @lift/domain/rest).
   * A platform that can read its alarms back after the app is killed keeps
   * it with the deadline, so an adjusted rest can be resumed as it was.
   */
  scheduleRestAlarm: (endsAt: number, body: string, tag: string) => Promise<void>;
  /** Called when a rest is skipped, ended by the next set, or the session ends. */
  cancelRestAlarm: () => Promise<void>;
  /** The app went to the background or the page was hidden. Returns an unsubscribe. */
  onBackground: (listener: () => void) => () => void;
  /** The app came back to the foreground. Returns an unsubscribe. */
  onForeground: (listener: () => void) => () => void;
};

const NONE: Platform = {
  scheduleRestAlarm: () => Promise.resolve(),
  cancelRestAlarm: () => Promise.resolve(),
  onBackground: () => () => undefined,
  onForeground: () => () => undefined,
};

let current: Platform = NONE;

export function setPlatform(platform: Platform): void {
  current = platform;
}

/** The registered platform. Read at call time, so registration order is free. */
export function platform(): Platform {
  return current;
}
