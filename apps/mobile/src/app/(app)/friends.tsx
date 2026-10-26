import { FriendsCard } from '../../components/friends/FriendsCard';
import { Screen } from '../../components/Screen';
import { BackTitle, Body } from '../../components/ui';

/**
 * Friends, on their own screen, as on the web: a code with a QR, requests in
 * and out, and the people you are connected to, which is more than a Settings
 * card has room for.
 */
export default function Friends() {
  return (
    <Screen>
      <BackTitle title="Friends" fallback="/settings" />
      <Body dimmed>
        Send a workout to somebody, and take one from them. That is the whole of it — a connection
        shows neither of you anything about the other&apos;s training.
      </Body>
      <FriendsCard />
    </Screen>
  );
}
