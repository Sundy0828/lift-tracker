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
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { UserAvatar } from '../Avatar';
import { Button, Card, Field, Heading, Notice, Small } from '../ui';

/**
 * Your name, and the avatar made from it: the web's `NameCard`. Both halves
 * are required and must pass `nameProblem`, so Save stays off until both pass.
 *
 * Unsaved typing is dropped when you leave the tab. A tab stays mounted, so
 * otherwise a cleared name would still read blank on the way back, as if it
 * had been saved.
 */
export function NameCard() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { profile, isPending } = useProfile();
  const [first, setFirst] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(
      () => () => {
        setFirst(null);
        setLast(null);
      },
      [],
    ),
  );

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
    <Card>
      <View style={styles.head}>
        <UserAvatar size={48} />
        <View style={styles.grow}>
          <Heading>{fullName(profile) === '' ? 'Your name' : fullName(profile)}</Heading>
          <Small>
            {accountPhoto(user) === null
              ? 'Your initials, on your accent colour.'
              : 'Your photo, from your linked Google account.'}
          </Small>
        </View>
      </View>

      {saved && !changed ? (
        <Notice
          tone="success"
          onClose={() => {
            setSaved(false);
          }}
        >
          Name saved.
        </Notice>
      ) : null}

      <View style={styles.names}>
        <View style={styles.grow}>
          <Field
            label="First name"
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
            editable={!isPending}
            error={first === null ? null : namePartProblem(first, 'first')}
            value={shownFirst}
            onChangeText={(value) => {
              setSaved(false);
              setFirst(value);
            }}
          />
        </View>
        <View style={styles.grow}>
          <Field
            label="Last name"
            autoComplete="family-name"
            textContentType="familyName"
            autoCapitalize="words"
            editable={!isPending}
            error={last === null ? null : namePartProblem(last, 'last')}
            value={shownLast}
            onChangeText={(value) => {
              setSaved(false);
              setLast(value);
            }}
          />
        </View>
      </View>
      <View style={styles.start}>
        <Button
          size="compact"
          variant="subtle"
          label="Save name"
          disabled={!changed || problem !== null}
          onPress={save}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 2 },
  names: { flexDirection: 'row', gap: 10 },
  start: { alignItems: 'flex-start' },
});
