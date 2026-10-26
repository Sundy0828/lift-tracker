import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../components/Screen';
import { Body, Button, Title } from '../components/ui';

/**
 * A link to a path the app does not have: the web's `NotFoundScreen`. Most
 * often an old link to a workout or session deleted since.
 */
export default function NotFound() {
  return (
    <Screen edges={['top', 'bottom']}>
      <Title>Page not found</Title>
      <Body dimmed>
        That address does not exist. It may have pointed at a workout or session that has since been
        deleted.
      </Body>
      <View style={styles.actions}>
        <Button
          label="Go to Today"
          onPress={() => {
            router.replace('/');
          }}
        />
        <Button
          variant="subtle"
          label="History"
          onPress={() => {
            router.replace('/history');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
});
