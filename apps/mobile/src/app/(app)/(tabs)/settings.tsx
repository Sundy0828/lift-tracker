import { useAuth } from '@lift/data/hooks/useAuth';
import { useSyncState } from '@lift/data/hooks/useSyncState';
import { Screen } from '../../../components/Screen';
import { Body, Button, Card, Title } from '../../../components/ui';

/** Account and sync status. The rest of web Settings arrives in Phase 5. */
export default function Settings() {
  const { user, signOutUser } = useAuth();
  const { syncedAt } = useSyncState();

  return (
    <Screen>
      <Title>Settings</Title>
      <Card>
        <Body dimmed>Signed in as</Body>
        <Body>{user?.email ?? 'unknown'}</Body>
      </Card>
      <Card>
        <Body dimmed>Last synced</Body>
        <Body>
          {syncedAt === null ? 'Nothing to sync this session' : new Date(syncedAt).toLocaleString()}
        </Body>
      </Card>
      <Button variant="subtle" label="Sign out" onPress={() => void signOutUser()} />
    </Screen>
  );
}
