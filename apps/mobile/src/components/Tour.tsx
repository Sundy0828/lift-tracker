import { TOUR_STEPS } from '@lift/domain/tour';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';
import { Button } from './ui';

/**
 * The first-run walkthrough: the web's `Tour`, from the same steps
 * (`@lift/domain/tour`), so both apps teach the same model.
 *
 * A card over the screen rather than tooltips pinned to real controls: what is
 * worth teaching lives on four screens. Skippable from the first step, and
 * not closed by tapping outside, which is easy to do by accident on a phone.
 * Whether it has been seen is on the profile, so it follows the account.
 */
export function Tour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const palette = usePalette();
  const [index, setIndex] = useState(0);

  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;
  if (step === undefined) return null;

  const close = (): void => {
    // Reset, so opening it again from Settings starts at the beginning.
    setIndex(0);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View
          testID="tour"
          style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Text style={[styles.eyebrow, { color: palette.dimmed }]}>HOW THIS WORKS</Text>
          <View
            accessibilityLabel={`Step ${String(index + 1)} of ${String(TOUR_STEPS.length)}`}
            style={[styles.track, { backgroundColor: palette.border }]}
          >
            <View
              style={[
                styles.fill,
                {
                  width: `${String(((index + 1) / TOUR_STEPS.length) * 100)}%`,
                  backgroundColor: palette.accent,
                },
              ]}
            />
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
            <Text style={[styles.title, { color: palette.text }]}>{step.title}</Text>
            <Text style={[styles.text, { color: palette.text }]}>{step.body}</Text>
            {step.points?.map((point) => (
              <View key={point} style={styles.point}>
                <Text style={[styles.text, { color: palette.dimmed }]}>•</Text>
                <Text style={[styles.text, styles.grow, { color: palette.dimmed }]}>{point}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <Button
              size="compact"
              variant="subtle"
              label={last ? 'Close' : 'Skip'}
              onPress={close}
            />
            <View style={styles.grow} />
            {index === 0 ? null : (
              <Button
                size="compact"
                variant="subtle"
                label="Back"
                onPress={() => {
                  setIndex((current) => current - 1);
                }}
              />
            )}
            <Button
              size="compact"
              label={last ? 'Start lifting' : 'Next'}
              onPress={() => {
                if (last) close();
                else setIndex((current) => current + 1);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10, maxHeight: '85%' },
  eyebrow: { fontSize: 12, letterSpacing: 0.6 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  scroll: { flexGrow: 0 },
  body: { gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 20 },
  point: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
