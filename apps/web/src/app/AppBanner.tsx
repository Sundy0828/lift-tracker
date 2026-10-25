import { Button, CloseButton, Group, Paper, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { bannerFor, platformOf, playStoreUrl, storesFrom } from './appStores';
import { useInstallPrompt } from './useInstallPrompt';
import classes from './InstallPrompt.module.css';

/**
 * Points a phone visitor at the app, by the route their phone supports.
 *
 * On an iPhone with no App Store listing yet that is the home-screen install,
 * which Safari never offers by itself; with a listing, Safari's own Smart App
 * Banner does the job and this stays away. On Android with a Play listing it
 * is a link to Play, unless Chrome's own install offer is already up (see
 * `bannerFor`). Dismissed once, it stays dismissed on this device.
 *
 * Never during a session: the set grid is the one screen nothing should cover.
 */

const STORES = storesFrom(import.meta.env);
const DISMISSED_KEY = 'lift-tracker.app-banner-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari reports an added-to-home-screen launch on `navigator.standalone`.
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return legacy || window.matchMedia('(display-mode: standalone)').matches;
}

export function AppBanner() {
  const { pathname } = useLocation();
  const { available } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);

  const kind = bannerFor(platformOf(navigator.userAgent, navigator.maxTouchPoints), STORES, {
    standalone: isStandalone(),
    installOfferShowing: available,
  });
  if (kind === null || dismissed || pathname.startsWith('/session/')) return null;

  const dismiss = (): void => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Not remembered, so it comes back next visit. Dismissed for now regardless.
    }
  };

  return (
    <Paper
      className={classes.sheet}
      withBorder
      shadow="md"
      radius="md"
      p="sm"
      data-testid="app-banner"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Stack gap={4}>
          {kind === 'ios-home-screen' ? (
            <>
              <Text size="sm" fw={600}>
                Add Lift Tracker to your home screen
              </Text>
              <Text size="xs" c="dimmed">
                Tap Share, then Add to Home Screen. It opens like an app and logs a whole session
                with no signal.
              </Text>
            </>
          ) : (
            <>
              <Text size="sm" fw={600}>
                Lift Tracker is on Google Play
              </Text>
              <Text size="xs" c="dimmed">
                The app keeps the rest timer on your lock screen, with alerts when the screen is
                off.
              </Text>
              {STORES.androidPackage === null ? null : (
                <Group>
                  <Button
                    component="a"
                    href={playStoreUrl(STORES.androidPackage)}
                    target="_blank"
                    rel="noopener"
                    size="compact-sm"
                  >
                    Get the app
                  </Button>
                </Group>
              )}
            </>
          )}
        </Stack>
        <CloseButton aria-label="Not now" onClick={dismiss} />
      </Group>
    </Paper>
  );
}
