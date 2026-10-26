import { useAuth } from '@lift/data/hooks/useAuth';
import { useProfile } from '@lift/data/hooks/useProfile';
import { accountPhoto, fullName, initials } from '@lift/domain/person';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';

/**
 * The signed-in person, as a circle: the web's `UserAvatar`. Their photo when
 * a linked account (Google) has one, otherwise their initials on the accent
 * colour, JS for Jerrod Sunderland. A photo that will not load falls back to
 * the initials.
 */
export function UserAvatar({ size = 36 }: { size?: number }) {
  const palette = usePalette();
  const { user } = useAuth();
  const { profile } = useProfile();
  const [failed, setFailed] = useState(false);
  const photo = accountPhoto(user);
  const name = fullName(profile);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (photo !== null && !failed) {
    return (
      <Image
        testID="user-avatar"
        accessibilityLabel={name === '' ? 'You' : name}
        source={{ uri: photo }}
        style={[circle, { backgroundColor: palette.border }]}
        onError={() => {
          setFailed(true);
        }}
      />
    );
  }

  return (
    <View
      testID="user-avatar"
      accessible
      accessibilityLabel={name === '' ? 'You' : name}
      style={[styles.circle, circle, { backgroundColor: palette.accent }]}
    >
      <Text style={[styles.initials, { color: palette.onAccent, fontSize: size * 0.4 }]}>
        {initials(profile, user?.email ?? null)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700' },
});
