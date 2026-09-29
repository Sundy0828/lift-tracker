import { Button, Group, List, Modal, Progress, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { TOUR_STEPS } from './tourSteps';

/**
 * The first-run walkthrough.
 *
 * A modal rather than a series of tooltips pinned to real controls: the things
 * worth teaching live on four different screens, and a tour that navigates you
 * around leaves you somewhere you did not choose to be. This says its piece and
 * gets out of the way.
 *
 * **Dismissible from the first step.** Anything behind a tour you cannot skip
 * is a thing people resent before they have seen it.
 */
export function Tour({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);

  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;
  if (step === undefined) return null;

  const close = (): void => {
    // Reset, so re-opening it from Settings starts at the beginning.
    setIndex(0);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="How this works"
      centered
      // Closing by tapping outside is easy to do by accident on a phone, and
      // this is the one screen people only see once.
      closeOnClickOutside={false}
    >
      {/* The hook is on the body, not on the Modal: Mantine spreads unknown
          props onto its portal root, which is present whether or not the modal
          is open — so a test could not tell the two apart. */}
      <Stack gap="sm" data-testid="tour">
        <Progress
          value={((index + 1) / TOUR_STEPS.length) * 100}
          size="xs"
          color="sky"
          aria-label={`Step ${String(index + 1)} of ${String(TOUR_STEPS.length)}`}
        />

        <Text fw={650}>{step.title}</Text>
        <Text size="sm">{step.body}</Text>

        {step.points === undefined ? null : (
          <List size="sm" spacing={6} c="dimmed">
            {step.points.map((point) => (
              <List.Item key={point}>{point}</List.Item>
            ))}
          </List>
        )}

        <Group justify="space-between" mt="xs">
          <Button variant="subtle" color="gray" size="compact-sm" onClick={close}>
            {last ? 'Close' : 'Skip'}
          </Button>
          <Group gap="xs">
            {index === 0 ? null : (
              <Button
                variant="default"
                size="compact-sm"
                onClick={() => {
                  setIndex((current) => current - 1);
                }}
              >
                Back
              </Button>
            )}
            <Button
              size="compact-sm"
              onClick={() => {
                if (last) close();
                else setIndex((current) => current + 1);
              }}
            >
              {last ? 'Start lifting' : 'Next'}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
