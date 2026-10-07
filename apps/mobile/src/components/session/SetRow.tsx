import type { SetAssessment } from '@lift/domain/sessions';
import type { Direction } from '@lift/domain/strength';
import type { Unit } from '@lift/domain/types';
import { MAX_REPS } from '@lift/domain/workouts';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../../theme';
import { usePalette } from '../../theme';
import { EffortField } from './EffortField';
import { NumberField } from './NumberField';

/**
 * One set: load, reps, the tick that finishes it, and effort underneath.
 *
 * Same contract as the web's `SetRow`: **every prop is a primitive** and every
 * handler is stable, so `memo` holds and writing one set re-renders one row,
 * not all fifty (§3). The parent formats the overlay strings.
 *
 * There is no add or delete for a set. The prescription is the plan; `skip`
 * records doing less and keeps the gap visible.
 */

export type SetHandlers = {
  onWeight: (entryKey: string, setIndex: number, value: number | null, unit: Unit) => void;
  onReps: (entryKey: string, setIndex: number, value: number | null) => void;
  onRir: (entryKey: string, setIndex: number, value: number | null) => void;
  onToggleComplete: (entryKey: string, setIndex: number) => void;
  onToggleSkipped: (entryKey: string, setIndex: number) => void;
  onToggleWarmup: (entryKey: string, setIndex: number) => void;
};

type Props = SetHandlers & {
  entryKey: string;
  setIndex: number;
  ordinal: string;
  weight: number | null;
  weightUnit: Unit;
  reps: number | null;
  rir: number | null;
  rirTarget: { min: number; max: number } | null;
  isWarmup: boolean;
  skipped: boolean;
  isComplete: boolean;
  displayUnit: Unit;
  assessment: SetAssessment;
  repRangeLabel: string | null;
  previousLabel: string | null;
  deltaLabel: string | null;
  deltaDirection: Direction | null;
};

function deltaColor(direction: Direction, palette: Palette): string {
  return direction === 'up' ? palette.up : direction === 'down' ? palette.down : palette.same;
}

/**
 * The note beside a row that needs attention, in words as well as colour.
 * `incomplete` outranks the rep range: a set missing its load or reps never
 * reaches history, and this is the last moment it can be fixed.
 */
function assessmentNote(
  assessment: SetAssessment,
  repRangeLabel: string | null,
  missing: 'weight' | 'reps' | null,
): string | null {
  if (assessment === 'incomplete') return `no ${missing ?? 'entry'} — will not be saved`;
  if (repRangeLabel === null) return null;
  if (assessment === 'under') return `under ${repRangeLabel}`;
  if (assessment === 'over') return `over ${repRangeLabel}`;
  return null;
}

/** The missing-number verdict from what is typed; the rep range from what is committed. */
function liveAssessment(
  assessment: SetAssessment,
  missing: 'weight' | 'reps' | null,
  isWarmup: boolean,
  skipped: boolean,
): SetAssessment {
  if (isWarmup || skipped) return assessment;
  if (missing !== null) return 'incomplete';
  return assessment === 'incomplete' ? 'unassessed' : assessment;
}

function SetRowBase({
  entryKey,
  setIndex,
  ordinal,
  weight,
  weightUnit,
  reps,
  rir,
  rirTarget,
  isWarmup,
  skipped,
  isComplete,
  displayUnit,
  assessment,
  repRangeLabel,
  previousLabel,
  deltaLabel,
  deltaDirection,
  onWeight,
  onReps,
  onRir,
  onToggleComplete,
  onToggleSkipped,
  onToggleWarmup,
}: Props) {
  const palette = usePalette();
  // A load typed now is in the unit on screen; an earlier one keeps its own.
  const entryUnit = weight === null ? displayUnit : weightUnit;
  const showUnit = weight !== null && weightUnit !== displayUnit;

  const [hasWeight, setHasWeight] = useState(weight !== null);
  const [hasReps, setHasReps] = useState(reps !== null);
  const onWeightFilled = useCallback((filled: boolean) => {
    setHasWeight(filled);
  }, []);
  const onRepsFilled = useCallback((filled: boolean) => {
    setHasReps(filled);
  }, []);

  const missing = hasWeight === hasReps ? null : hasWeight ? 'reps' : 'weight';
  const live = liveAssessment(assessment, missing, isWarmup, skipped);
  const note = assessmentNote(live, repRangeLabel, missing);
  const flagged = live === 'under' || live === 'over' || live === 'incomplete';

  return (
    <View
      style={[
        styles.row,
        { borderLeftColor: flagged ? palette.warn : 'transparent' },
        skipped && styles.skipped,
      ]}
    >
      <View style={styles.main}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${ordinal}${isWarmup ? ', warmup' : ''}. Tap to toggle warmup`}
          accessibilityState={{ selected: isWarmup }}
          onPress={() => {
            onToggleWarmup(entryKey, setIndex);
          }}
          style={[styles.ordinal, { borderColor: palette.border }]}
        >
          <Text style={[styles.ordinalText, { color: isWarmup ? palette.dimmed : palette.text }]}>
            {ordinal}
          </Text>
        </Pressable>

        <NumberField
          label={`Set ${ordinal} weight`}
          value={weight}
          min={0}
          max={2000}
          placeholder={displayUnit}
          decimal
          disabled={skipped}
          onFilled={onWeightFilled}
          onCommit={(value) => {
            onWeight(entryKey, setIndex, value, entryUnit);
          }}
        />
        <NumberField
          label={`Set ${ordinal} reps`}
          value={reps}
          min={0}
          max={MAX_REPS}
          placeholder="reps"
          decimal={false}
          disabled={skipped}
          onFilled={onRepsFilled}
          onCommit={(value) => {
            onReps(entryKey, setIndex, value);
          }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isComplete ? `Set ${ordinal} done, undo` : `Complete set ${ordinal}`}
          accessibilityState={{ checked: isComplete, disabled: skipped }}
          disabled={skipped}
          onPress={() => {
            void Haptics.impactAsync(
              isComplete ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
            );
            onToggleComplete(entryKey, setIndex);
          }}
          style={[
            styles.tick,
            isComplete
              ? { backgroundColor: palette.accent, borderColor: palette.accent }
              : { borderColor: palette.border },
            skipped && styles.disabled,
          ]}
        >
          <Text
            style={[styles.tickText, { color: isComplete ? palette.onAccent : palette.dimmed }]}
          >
            ✓
          </Text>
        </Pressable>
      </View>

      <View style={styles.meta}>
        <EffortField
          setLabel={`Set ${ordinal}`}
          value={rir}
          target={rirTarget}
          disabled={skipped}
          onChange={(value) => {
            onRir(entryKey, setIndex, value);
          }}
        />
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            onToggleSkipped(entryKey, setIndex);
          }}
        >
          <Text style={[styles.small, { color: palette.dimmed }]}>
            {skipped ? 'unskip' : 'skip'}
          </Text>
        </Pressable>
      </View>

      {previousLabel === null && note === null && !showUnit ? null : (
        <View style={[styles.meta, styles.info]}>
          {previousLabel === null ? null : (
            <Text style={[styles.small, { color: palette.dimmed }]}>last {previousLabel}</Text>
          )}
          {deltaLabel === null || deltaDirection === null ? null : (
            <Text
              style={[styles.small, styles.strong, { color: deltaColor(deltaDirection, palette) }]}
            >
              {deltaLabel}
            </Text>
          )}
          {note === null ? null : (
            <Text style={[styles.small, { color: palette.warn }]}>{note}</Text>
          )}
          {showUnit ? (
            <Text style={[styles.small, { color: palette.dimmed }]}>logged in {weightUnit}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

export const SetRow = memo(SetRowBase);

const styles = StyleSheet.create({
  row: { gap: 6, paddingVertical: 8, paddingLeft: 6, borderLeftWidth: 3 },
  skipped: { opacity: 0.55 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ordinal: {
    width: 36,
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordinalText: { fontSize: 16, fontWeight: '700' },
  // 52 wide: the most-pressed control on the screen gets the biggest target.
  tick: {
    width: 52,
    height: 48,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickText: { fontSize: 20, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 44,
  },
  info: { justifyContent: 'flex-start' },
  small: { fontSize: 13 },
  strong: { fontWeight: '700' },
});
