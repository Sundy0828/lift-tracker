import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useLocation } from 'react-router';
import classes from './InstallPrompt.module.css';
import { useInstallPrompt } from './useInstallPrompt';

/**
 * The install offer, kept out of the way of a workout.
 *
 * Installing matters here for one concrete reason worth saying out loud: a
 * home-screen launch gets the service worker and the Firestore cache, which is
 * what makes a cold start in a basement gym work at all (§2.8). So the copy
 * names the benefit rather than asking to be added to a home screen.
 *
 * It never appears over an active session. Mid-set is the worst possible
 * moment to be asked anything, and the browser only fires the event once per
 * page load — so waiting costs nothing, and the offer is there on Today when
 * the session ends.
 */
export function InstallPrompt() {
  const { available, install, dismiss } = useInstallPrompt();
  const { pathname } = useLocation();

  const duringSession = pathname.startsWith('/session/');
  if (!available || duringSession) return null;

  return (
    <Paper className={classes.sheet} withBorder shadow="md" radius="md" p="sm">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          Install Lift Tracker
        </Text>
        <Text size="xs" c="dimmed">
          Installing keeps the app and your exercise library on the device, so it opens and logs a
          full session with no signal at all.
        </Text>
        <Group gap="xs" justify="flex-end">
          <Button variant="subtle" size="compact-sm" onClick={dismiss}>
            Not now
          </Button>
          <Button
            size="compact-sm"
            onClick={() => {
              void install();
            }}
          >
            Install
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
