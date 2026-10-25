import { Alert, Button, Card, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { UserAvatar } from '@/components/Avatar';
import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { setName } from '@lift/data/mutations/profile';
import {
  accountPhoto,
  cleanName,
  fullName,
  nameProblem,
  namePartProblem,
} from '@lift/domain/person';

/**
 * Your name, and the avatar made from it.
 *
 * Both halves are required and letters only, so Save stays off until both
 * pass rather than accepting a bad name and quietly keeping the old one.
 */
export function NameCard() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { profile, isPending } = useProfile();
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const shownFirst = first ?? profile.firstName;
  const shownLast = last ?? profile.lastName;
  const problem = nameProblem(shownFirst, shownLast);
  const changed =
    cleanName(shownFirst) !== profile.firstName || cleanName(shownLast) !== profile.lastName;

  const save = (): void => {
    if (uid === null || problem !== null) return;
    // Not awaited: the local cache has it at once, and it syncs on its own.
    void setName(uid, shownFirst, shownLast);
    setFirst(null);
    setLast(null);
    setSaved(true);
  };

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap">
          <UserAvatar size="lg" />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {fullName(profile) === '' ? 'Your name' : fullName(profile)}
            </Text>
            <Text size="xs" c="dimmed">
              {accountPhoto(user) === null
                ? 'Your initials, on your accent colour.'
                : 'Your photo, from your linked Google account.'}
            </Text>
          </Stack>
        </Group>

        {saved && !changed ? (
          <Alert
            variant="light"
            color="green"
            withCloseButton
            onClose={() => {
              setSaved(false);
            }}
          >
            <Text size="sm">Name saved.</Text>
          </Alert>
        ) : null}

        <Group grow align="flex-start">
          <TextInput
            label="First name"
            autoComplete="given-name"
            required
            disabled={isPending}
            value={shownFirst}
            error={first === null ? null : namePartProblem(first, 'first')}
            onChange={(event) => {
              setSaved(false);
              setFirst(event.currentTarget.value);
            }}
          />
          <TextInput
            label="Last name"
            autoComplete="family-name"
            required
            disabled={isPending}
            value={shownLast}
            error={last === null ? null : namePartProblem(last, 'last')}
            onChange={(event) => {
              setSaved(false);
              setLast(event.currentTarget.value);
            }}
          />
        </Group>
        <Group>
          <Button variant="default" disabled={!changed || problem !== null} onClick={save}>
            Save name
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
