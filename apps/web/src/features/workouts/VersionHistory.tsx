import { Badge, Group, List, Modal, Stack, Text, Timeline } from '@mantine/core';
import { useState } from 'react';
import { describeChange, diffWorkout } from '@lift/domain/workoutDiff';
import type { WorkoutVersion } from '@lift/domain/workouts';
import {
  exerciseSlots,
  formatPrescription,
  formatRestSeconds,
  restSlotSeconds,
  totalSets,
} from '@lift/domain/workouts';

type Props = {
  versions: readonly WorkoutVersion[];
  currentVersion: number;
};

function formatDate(iso: string | null): string {
  if (iso === null) return 'saving…';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The version list, and a read-only view of any snapshot.
 *
 * Opening an old version renders that snapshot's own exercises, never the live
 * workout — which is the mechanism behind "edit the workout and week 1 still
 * reads correctly" (§2.5). The snapshot carries its own name too, so a
 * renamed workout's old versions still read under the name they had.
 *
 * It also lists what changed from the version before, worked out by
 * `diffWorkout` as on publish, so a terse summary can be read in full.
 */
export function VersionHistory({ versions, currentVersion }: Props) {
  const [viewing, setViewing] = useState<WorkoutVersion | null>(null);
  // Newest first, so the one before is the next in the list; null for v1.
  const previous = viewing === null ? null : (versions[versions.indexOf(viewing) + 1] ?? null);

  if (versions.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No versions published yet. Publishing snapshots the workout so sessions logged against it
        stay readable after you edit it.
      </Text>
    );
  }

  return (
    <>
      <Timeline active={0} bulletSize={18} lineWidth={2}>
        {versions.map((version) => (
          <Timeline.Item
            key={version.versionNumber}
            title={
              <Group gap="xs">
                <Text size="sm" fw={600}>
                  v{version.versionNumber}
                </Text>
                {version.versionNumber === currentVersion ? (
                  <Badge size="xs" variant="light" color="sky">
                    current
                  </Badge>
                ) : null}
              </Group>
            }
          >
            <Text
              size="sm"
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              onClick={() => {
                setViewing(version);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setViewing(version);
              }}
            >
              {version.changeSummary === '' ? 'No summary' : version.changeSummary}
            </Text>
            <Text size="xs" c="dimmed">
              {formatDate(version.createdAt)} ·{' '}
              {exerciseSlots(version.slots).length === 1
                ? '1 exercise'
                : `${String(exerciseSlots(version.slots).length)} exercises`}{' '}
              · {totalSets(version)} sets
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>

      <Modal
        opened={viewing !== null}
        onClose={() => {
          setViewing(null);
        }}
        title={viewing === null ? '' : `Version ${String(viewing.versionNumber)}`}
        fullScreen
      >
        {viewing === null ? null : (
          <Stack>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600}>{viewing.name}</Text>
              <Text size="xs" c="dimmed">
                {totalSets(viewing)} sets
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {viewing.changeSummary} · {formatDate(viewing.createdAt)}
            </Text>
            <Text size="xs" c="dimmed">
              This is an immutable snapshot. Editing the workout never changes it.
            </Text>

            <Stack gap={4}>
              <Text size="sm" fw={600}>
                {previous === null
                  ? 'First version'
                  : `Changes from v${String(previous.versionNumber)}`}
              </Text>
              <List size="sm" spacing={2}>
                {diffWorkout(previous, viewing).changes.map((change, index) => (
                  <List.Item key={String(index)}>{describeChange(change)}</List.Item>
                ))}
              </List>
            </Stack>

            {viewing.slots.length === 0 ? (
              <Text size="sm" c="dimmed">
                This version had no exercises.
              </Text>
            ) : (
              <Stack gap={6}>
                {viewing.slots.map((slot) => (
                  <Group key={slot.slotId} justify="space-between" gap="xs" wrap="nowrap">
                    {/* A rest row has no name, and its prescription is only its length. */}
                    <Text size="sm" lineClamp={1} c={slot.kind === 'rest' ? 'dimmed' : 'bright'}>
                      {slot.kind === 'rest' ? 'Rest' : slot.exerciseName}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {slot.kind === 'rest'
                        ? formatRestSeconds(restSlotSeconds(slot))
                        : formatPrescription(slot.prescription)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
