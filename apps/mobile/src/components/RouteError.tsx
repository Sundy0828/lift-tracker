import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from './Screen';
import { Body, Button, Card, Small, Title } from './ui';

/**
 * What a screen that throws shows instead: the web's `RouteError`. Exported
 * as `ErrorBoundary` from the layouts, so expo-router renders it in place of
 * the failed screen and the rest of the app keeps working.
 *
 * The first thing said is that logged sets are safe, because that is the
 * question behind the fright: writes land in the local cache before anything
 * renders, so an error here has never lost a set.
 */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen edges={['top', 'bottom']}>
      <Title>Something went wrong</Title>
      <Body dimmed>
        Your logged sets are safe — they were saved on this phone before this screen failed.
      </Body>
      <Card>
        <Small>{error.message === '' ? 'Unknown error' : error.message}</Small>
      </Card>
      <View style={styles.actions}>
        <Button label="Try again" onPress={() => void retry()} />
        <Button
          variant="subtle"
          label="Go to Today"
          onPress={() => {
            router.replace('/');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
});
