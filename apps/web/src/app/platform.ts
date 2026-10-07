import type { Platform } from '@lift/data/platform';
import { cancelRestNotification, scheduleRestNotification } from '@/features/logging/notifications';

/**
 * The browser's side of `@lift/data/platform`.
 *
 * The rest alarm is the service worker's notification (see `sw.ts`). The app
 * counts as backgrounded on `pagehide` or a hidden `visibilitychange` rather
 * than on `beforeunload`: on a phone, being backgrounded is how a page
 * actually stops running, and `beforeunload` is not reliably fired for it.
 */
export const webPlatform: Platform = {
  scheduleRestAlarm: scheduleRestNotification,
  cancelRestAlarm: cancelRestNotification,

  onBackground(listener) {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') listener();
    };
    window.addEventListener('pagehide', listener);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', listener);
      document.removeEventListener('visibilitychange', onHide);
    };
  },

  onForeground(listener) {
    // Every visibility change, as before the move: resyncing a clock on the
    // way out costs nothing, and the frame the user sees on return is right.
    document.addEventListener('visibilitychange', listener);
    return () => {
      document.removeEventListener('visibilitychange', listener);
    };
  },
};
