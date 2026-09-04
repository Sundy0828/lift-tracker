import { Badge, Card, Group, Modal, Stack, Text, Timeline } from '@mantine/core';
import { useState } from 'react';
import type { PlanVersion } from '@/domain/plans';
import { formatPrescription, totalSets } from '@/domain/plans';

type Props = {
  versions: readonly PlanVersion[];
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
 * Opening an old version renders that snapshot's own workouts, never the live
 * plan — which is the mechanism behind "edit the plan and week 1 still reads
 * correctly" (§2.5).
 */
export function VersionHistory({ versions, currentVersion }: Props) {
  const [viewing, setViewing] = useState<PlanVersion | null>(null);

  if (versions.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No versions published yet. Publishing snapshots the plan so sessions logged against it stay
        readable after you edit it.
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
                  <Badge size="xs" variant="light" color="amber">
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
              {version.workouts.length === 1
                ? '1 workout'
                : `${String(version.workouts.length)} workouts`}
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
            <Text size="sm" c="dimmed">
              {viewing.changeSummary} · {formatDate(viewing.createdAt)}
            </Text>
            <Text size="xs" c="dimmed">
              This is an immutable snapshot. Editing the plan never changes it.
            </Text>

            {viewing.workouts.length === 0 ? (
              <Text size="sm" c="dimmed">
                This version had no workouts.
              </Text>
            ) : (
              viewing.workouts.map((workout) => (
                <Card key={workout.workoutId} withBorder padding="sm">
                  <Stack gap={6}>
                    <Group justify="space-between">
                      <Text fw={600} size="sm">
                        {workout.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {totalSets(workout)} sets
                      </Text>
                    </Group>
                    {workout.slots.length === 0 ? (
                      <Text size="xs" c="dimmed">
                        No exercises.
                      </Text>
                    ) : (
                      workout.slots.map((slot) => (
                        <Group key={slot.slotId} justify="space-between" gap="xs" wrap="nowrap">
                          <Text size="sm" lineClamp={1}>
                            {slot.exerciseName}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            {formatPrescription(slot.prescription)}
                          </Text>
                        </Group>
                      ))
                    )}
                  </Stack>
                </Card>
              ))
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
