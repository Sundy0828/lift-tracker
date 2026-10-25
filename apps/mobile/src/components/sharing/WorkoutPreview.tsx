import type { WorkoutBody } from '@lift/domain/workouts';
import {
  exerciseSlots,
  formatPrescription,
  formatRestSeconds,
  isRestSlot,
  restSlotSeconds,
  totalSets,
} from '@lift/domain/workouts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../../theme';
import { Badge, Body, Card, Row, Small } from '../ui';

/**
 * A shared or library workout, read-only: the web's `WorkoutPreview`.
 *
 * Not the editor's `SlotList`, which is all drag and swipe. Names come from
 * the snapshot's own `exerciseName`: a recipient cannot resolve the sender's
 * custom-exercise ids, and the denormalised name is what makes a share render.
 *
 * `onShowExercise` makes each row open its instructions. The library passes
 * it (every id there is a catalog one); a share does not.
 */
export function WorkoutPreview({
  body,
  onShowExercise,
}: {
  body: WorkoutBody;
  onShowExercise?: (exerciseId: string) => void;
}) {
  const palette = usePalette();
  const exercises = exerciseSlots(body.slots);

  return (
    <View style={styles.root}>
      <Row>
        <Badge
          label={exercises.length === 1 ? '1 exercise' : `${String(exercises.length)} exercises`}
        />
        <Badge label={`${String(totalSets(body))} sets`} />
      </Row>

      {body.slots.length === 0 ? <Body dimmed>This workout has no exercises in it.</Body> : null}

      {body.slots.map((slot) =>
        isRestSlot(slot) ? (
          <Text key={slot.slotId} style={[styles.rest, { color: palette.dimmed }]}>
            rest {formatRestSeconds(restSlotSeconds(slot))}
          </Text>
        ) : (
          <Card key={slot.slotId}>
            <View style={styles.head}>
              <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>
                {slot.exerciseName}
              </Text>
              {slot.supersetGroup === null ? null : <Badge tone="accent" label="circuit" />}
              {onShowExercise === undefined ? null : (
                <Pressable
                  testID="preview-how-to"
                  accessibilityRole="button"
                  accessibilityLabel={`How to do ${slot.exerciseName}`}
                  hitSlop={8}
                  onPress={() => {
                    onShowExercise(slot.exerciseId);
                  }}
                >
                  <Badge label="How to" />
                </Pressable>
              )}
            </View>
            <Small>{formatPrescription(slot.prescription)}</Small>
            {slot.prescription.loadHint === null ? null : (
              <Small>{slot.prescription.loadHint}</Small>
            )}
            {slot.notes === '' ? null : <Small>{slot.notes}</Small>}
          </Card>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  rest: { fontSize: 12, textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
});
