import { loadExerciseDetails } from '@lift/catalog';
import type { Exercise, ExerciseDetails } from '@lift/domain/exercises';
import { catalogImageUrls, equipmentLabel } from '@lift/domain/exercises';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { MuscleFocus } from '../MuscleMap';
import { Badge, Row } from '../ui';

/**
 * One exercise: both movement frames, its badges, the muscles it works on the
 * body diagram, and how to do it. The web's `ExerciseDetail`.
 *
 * The two frames are the start and end of the lift, which is the fastest way
 * to tell ten near-identical lateral raises apart. They are remote images, so
 * offline they collapse to one line; a custom exercise has none at all and
 * shows no picture area.
 */

function Frames({ exercise }: { exercise: Exercise }) {
  const palette = usePalette();
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());
  const urls = catalogImageUrls(exercise);

  if (urls.length === 0) return null;

  if (urls.every((_, position) => failed.has(position))) {
    return (
      <Text style={[styles.small, { color: palette.dimmed }]}>
        Pictures need a connection — they are cached once you have seen them.
      </Text>
    );
  }

  return (
    <View style={styles.frames}>
      {urls.map((url, position) =>
        failed.has(position) ? null : (
          <View key={url} style={styles.frame}>
            <Image
              source={{ uri: url }}
              accessibilityLabel={`${exercise.name}, ${position === 0 ? 'start' : 'finish'}`}
              style={[styles.image, { backgroundColor: palette.surface }]}
              resizeMode="cover"
              onError={() => {
                setFailed((current) => new Set(current).add(position));
              }}
            />
            <Text style={[styles.small, { color: palette.dimmed }]}>
              {position === 0 ? 'Start' : 'Finish'}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

export function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  const palette = usePalette();
  const { id, isCustom } = exercise;

  // Tagged with the id it belongs to, so a second exercise shows a loading
  // state rather than the first one's instructions.
  const [loaded, setLoaded] = useState<{ id: string; details: ExerciseDetails | null } | null>(
    null,
  );

  useEffect(() => {
    if (isCustom) return;
    let cancelled = false;
    loadExerciseDetails().then(
      (map) => {
        if (!cancelled) setLoaded({ id, details: map.get(id) ?? null });
      },
      () => {
        if (!cancelled) setLoaded({ id, details: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, isCustom]);

  const details = loaded?.id === id ? loaded.details : null;
  const loading = !isCustom && loaded?.id !== id;

  const facts = [exercise.mechanic, exercise.level, exercise.force].filter(
    (fact): fact is NonNullable<typeof fact> => fact !== null,
  );

  return (
    <View style={styles.root}>
      <Frames exercise={exercise} />

      <Row>
        {exercise.isCustom ? <Badge tone="accent" label="Custom" /> : null}
        {facts.map((fact) => (
          <Badge key={fact} label={fact} />
        ))}
        <Badge label={equipmentLabel(exercise.equipment)} />
      </Row>

      <MuscleFocus primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} />

      {isCustom ? null : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={[styles.small, { color: palette.dimmed }]}>Loading instructions…</Text>
        </View>
      ) : details === null || details.instructions.length === 0 ? (
        <Text style={[styles.small, { color: palette.dimmed }]}>No instructions available.</Text>
      ) : (
        <View style={styles.block}>
          <Text style={[styles.label, { color: palette.text }]}>Instructions</Text>
          {details.instructions.map((step, position) => (
            <View key={`${id}-${String(position)}`} style={styles.step}>
              <Text style={[styles.body, styles.stepNumber, { color: palette.dimmed }]}>
                {String(position + 1)}.
              </Text>
              <Text style={[styles.body, styles.stepText, { color: palette.text }]}>{step}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  frames: { flexDirection: 'row', gap: 8 },
  frame: { flex: 1, gap: 4, alignItems: 'center' },
  image: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  block: { gap: 4 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13 },
  step: { flexDirection: 'row', gap: 6 },
  stepNumber: { minWidth: 20 },
  stepText: { flex: 1 },
});
