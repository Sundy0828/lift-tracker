import { Button, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import type { PersonalRecord } from '@/domain/overlay';
import { formatE1rm, formatSet } from '@/domain/strength';
import type { Unit } from '@/domain/types';

/** The set that did it and the estimate it set. */
function detail(pr: PersonalRecord, unit: Unit): string {
  const first = pr.previousE1rmKg === 0 ? ' (first time)' : '';
  return `${formatSet(pr.set, unit)} · est. 1RM ${formatE1rm(pr.e1rmKg, unit)}${first}`;
}

type Props = {
  prs: readonly PersonalRecord[];
  unit: Unit;
};

/**
 * A session's records as one notification: the lifts by name, and the numbers
 * behind them on request. A single record is stated outright.
 */
export function PrSummary({ prs, unit }: Props) {
  const [open, setOpen] = useState(false);
  const [only] = prs;

  if (only !== undefined && prs.length === 1) return <Text size="sm">{detail(only, unit)}</Text>;

  return (
    <Stack gap={4}>
      {open ? (
        prs.map((pr, index) => (
          <Text key={`${pr.exerciseId}-${String(index)}`} size="xs">
            {pr.exerciseName} — {detail(pr, unit)}
          </Text>
        ))
      ) : (
        <Text size="sm">{prs.map((pr) => pr.exerciseName).join(', ')}</Text>
      )}
      <Button
        size="compact-xs"
        variant="subtle"
        color="gray"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {open ? 'Hide' : 'Show all'}
      </Button>
    </Stack>
  );
}
