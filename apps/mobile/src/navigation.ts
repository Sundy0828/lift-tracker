import { router, useNavigation, type Href } from 'expo-router';
import { useCallback, useEffect } from 'react';

/**
 * How long a screen stays locked if its push never lands (a route already
 * showing). Only a backstop: coming back to the screen unlocks it at once.
 */
const STUCK_MS = 5000;

/** The screen that last pushed, and when. Its further pushes are dropped. */
let locked: { origin: object; at: number } | null = null;

/**
 * `router.push`, once per visit to a screen.
 *
 * While the app is busy, taps are queued and handed over when it frees up,
 * which can be after the first push has already landed. So neither a time
 * window nor "until the next screen shows" stops a second Resume: the queued
 * tap still runs on the screen it was aimed at, and stacked a second session.
 *
 * Instead the lock belongs to the screen the tap came from. Once a screen has
 * pushed, nothing more is pushed from it until it is focused again, which
 * only happens when you come back to it. Pushes from the new screen are its
 * own and go through.
 */
export function usePush(): (href: Href) => void {
  const navigation = useNavigation();

  // The focus event, not a focus effect: an effect also runs when a row
  // mounts on a screen that is still leaving, which would unlock it early.
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        if (locked?.origin === navigation) locked = null;
      }),
    [navigation],
  );

  return useCallback(
    (href: Href) => {
      const now = Date.now();
      if (locked?.origin === navigation && now - locked.at < STUCK_MS) return;
      locked = { origin: navigation, at: now };
      router.push(href);
    },
    [navigation],
  );
}
