import type { Exercise } from '@lift/domain/exercises';
import { catalogImageUrls } from '@lift/domain/exercises';
import { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';

/**
 * The first frame of an exercise, small: the web's `ExerciseThumb`.
 *
 * The images are remote, and a few exercises (and every custom one) have
 * none, so a missing or failed image falls back to a neutral glyph rather
 * than an empty box. The list is a FlatList, so only rows near the screen
 * ever fetch.
 */
export const ExerciseThumb = memo(function ExerciseThumb({
  exercise,
  size = 44,
}: {
  exercise: Exercise;
  size?: number;
}) {
  const palette = usePalette();
  const [failed, setFailed] = useState(false);
  const url = catalogImageUrls(exercise)[0];
  const box = { width: size, height: size };

  if (url === undefined || failed) {
    return (
      <View
        importantForAccessibility="no-hide-descendants"
        style={[styles.thumb, styles.placeholder, box, { backgroundColor: palette.border }]}
      >
        <Text style={[styles.glyph, { color: palette.dimmed }]}>
          {exercise.isCustom ? '★' : '◍'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityIgnoresInvertColors
      importantForAccessibility="no"
      source={{ uri: url }}
      style={[styles.thumb, box, { backgroundColor: palette.border }]}
      onError={() => {
        setFailed(true);
      }}
    />
  );
});

const styles = StyleSheet.create({
  thumb: { borderRadius: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 16 },
});
