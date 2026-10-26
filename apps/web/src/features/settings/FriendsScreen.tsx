import { Stack, Text } from '@mantine/core';
import { BackTitle } from '@/app/BackTitle';
import { FriendsCard } from './FriendsCard';

/**
 * Friends, on their own screen.
 *
 * It outgrew a Settings card: a code with a QR, requests in, requests out and
 * the people you are connected to is four lists, and Settings is already a
 * long page of unrelated switches. Everything here is still one card — the
 * screen exists so the card has room and a name.
 */
export default function FriendsScreen() {
  return (
    <Stack>
      <BackTitle to="/settings" title="Friends" />

      <Text size="sm" c="dimmed">
        Send a workout to somebody, and take one from them. That is the whole of it — a connection
        shows neither of you anything about the other&apos;s training.
      </Text>

      <FriendsCard />
    </Stack>
  );
}
