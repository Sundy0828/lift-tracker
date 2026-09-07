import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/data/hooks/useAuth';
import { usePlans } from '@/data/hooks/usePlans';
import { useProfile } from '@/data/hooks/useProfile';
import { archivePlan, createPlan, deletePlan, newId } from '@/data/mutations/plans';
import { estimatePlanSeconds, formatEstimate, orderedWorkouts, totalSets } from '@/domain/plans';

export default function PlansScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { plans, isPending } = usePlans();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const active = plans.filter((plan) => plan.archivedAt === null);
  const archived = plans.filter((plan) => plan.archivedAt !== null);

  const create = (): void => {
    const trimmed = name.trim();
    if (uid === null || trimmed === '') return;

    const planId = newId();
    // Not awaited: the plan appears from the local cache immediately.
    void createPlan(uid, planId, trimmed);
    setCreating(false);
    setName('');
    void navigate(`/plans/${planId}`);
  };

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>Plans</Title>
        <Button
          size="compact-md"
          onClick={() => {
            setCreating(true);
          }}
        >
          New
        </Button>
      </Group>

      {isPending ? (
        <Skeleton height={120} radius="md" />
      ) : active.length === 0 ? (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600}>No plans yet</Text>
            <Text size="sm" c="dimmed">
              A plan holds your named workouts — PUSH, PULL, CHEST + DELTS — each with its own
              exercises and prescriptions.
            </Text>
            <Button
              variant="light"
              onClick={() => {
                setCreating(true);
              }}
            >
              Create your first plan
            </Button>
          </Stack>
        </Card>
      ) : (
        active.map((plan) => {
          const workouts = orderedWorkouts(plan);
          const weeklySets = workouts.reduce((sum, workout) => sum + totalSets(workout), 0);

          return (
            <Card key={plan.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    component={Link}
                    to={`/plans/${plan.id}`}
                    fw={600}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    {plan.name}
                  </Text>
                  <Group gap="xs">
                    <Badge variant="light" color="gray" size="sm">
                      {workouts.length === 1 ? '1 workout' : `${String(workouts.length)} workouts`}
                    </Badge>
                    <Badge variant="light" color="gray" size="sm">
                      {weeklySets} sets / week
                    </Badge>
                    {workouts.length === 0 ? null : (
                      <Badge variant="light" color="gray" size="sm">
                        ~{formatEstimate(estimatePlanSeconds(workouts, profile.defaultRestSeconds))}{' '}
                        / week
                      </Badge>
                    )}
                    <Badge
                      variant="light"
                      color={plan.currentVersion === 0 ? 'gray' : 'amber'}
                      size="sm"
                    >
                      {plan.currentVersion === 0
                        ? 'unpublished'
                        : `v${String(plan.currentVersion)}`}
                    </Badge>
                  </Group>
                  {workouts.length > 0 ? (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {workouts.map((workout) => workout.name).join(' · ')}
                    </Text>
                  ) : null}
                </Stack>
                <Group gap={2} wrap="nowrap">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={`Archive ${plan.name}`}
                    onClick={() => {
                      if (uid !== null) void archivePlan(uid, plan.id, true);
                    }}
                  >
                    ▽
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Delete ${plan.name}`}
                    onClick={() => {
                      if (uid !== null) void deletePlan(uid, plan.id);
                    }}
                  >
                    ✕
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          );
        })
      )}

      {archived.length > 0 ? (
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed">
            Archived
          </Text>
          {archived.map((plan) => (
            <Card key={plan.id} withBorder padding="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {plan.name}
                </Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => {
                    if (uid !== null) void archivePlan(uid, plan.id, false);
                  }}
                >
                  Restore
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      ) : null}

      <Modal
        opened={creating}
        onClose={() => {
          setCreating(false);
        }}
        title="New plan"
      >
        <Stack>
          <TextInput
            label="Plan name"
            placeholder="PPL + Upper"
            required
            data-autofocus
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') create();
            }}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setCreating(false);
              }}
            >
              Cancel
            </Button>
            <Button disabled={name.trim() === ''} onClick={create}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
