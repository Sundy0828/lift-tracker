import type { Measure } from '@lift/domain/measure';
import { MAX_LOAD } from '@lift/domain/sessions';
import type { SetAssessment } from '@lift/domain/sessions';
import type { Direction } from '@lift/domain/strength';
import type { Unit } from '@lift/domain/types';
import { stepFor } from '@lift/domain/units';
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
  /** The set's reps, seconds or distance, by the row's measure. */
  onAmount: (entryKey: string, setIndex: number, value: number | null) => void;
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
  /** What the second box holds: reps, seconds or a distance. */
  measure: Measure;
  /** The set's reps, seconds or distance (in the row's unit). */
  amount: number | null;
  amountPlaceholder: string;
  amountStep: number;
  amountMax: number;
  amountDecimal: boolean;
  rir: number | null;
  rirTarget: { min: number; max: number } | null;
  isWarmup: boolean;
  skipped: boolean;
  isComplete: boolean;
  displayUnit: Unit;
  assessment: SetAssessment;
  targetLabel: string | null;
  previousLabel: string | null;
  deltaLabel: string | null;
  deltaDirection: Direction | null;
  /** What the delta adds up to, shown when the chip is tapped (the web's tooltip). */
  deltaDetail: string | null;
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
  targetLabel: string | null,
  missing: string | null,
): string | null {
  if (assessment === 'incomplete') return `no ${missing ?? 'entry'} — will not be saved`;
  if (targetLabel === null) return null;
  if (assessment === 'under') return `under ${targetLabel}`;
  if (assessment === 'over') return `over ${targetLabel}`;
  return null;
}

/** What the second box is called, for its label and the missing-number note. */
const AMOUNT_NAMES: Record<Measure, string> = { reps: 'reps', time: 'time', distance: 'distance' };

/** The missing-number verdict from what is typed; the rep range from what is committed. */
function liveAssessment(
  assessment: SetAssessment,
  missing: string | null,
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
  measure,
  amount,
  amountPlaceholder,
  amountStep,
  amountMax,
  amountDecimal,
  rir,
  rirTarget,
  isWarmup,
  skipped,
  isComplete,
  displayUnit,
  assessment,
  targetLabel,
  previousLabel,
  deltaLabel,
  deltaDirection,
  deltaDetail,
  onWeight,
  onAmount,
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
  const [hasReps, setHasReps] = useState(amount !== null);
  const onWeightFilled = useCallback((filled: boolean) => {
    setHasWeight(filled);
  }, []);
  const onRepsFilled = useCallback((filled: boolean) => {
    setHasReps(filled);
  }, []);

  const [explained, setExplained] = useState(false);

  // A reps set needs both numbers. A time or distance needs only itself, so
  // the only half-entry there is a load with nothing beside it.
  const amountName = AMOUNT_NAMES[measure];
  const missing =
    measure === 'reps'
      ? hasWeight === hasReps
        ? null
        : hasWeight
          ? 'reps'
          : 'weight'
      : hasWeight && !hasReps
        ? amountName
        : null;
  const live = liveAssessment(assessment, missing, isWarmup, skipped);
  const note = assessmentNote(live, targetLabel, missing);
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
          step={stepFor(entryUnit)}
          // Below zero is assistance: an assisted pull-up or dip machine.
          min={-MAX_LOAD}
          max={MAX_LOAD}
          start={0}
          placeholder={displayUnit}
          decimal
          signed
          disabled={skipped}
          onFilled={onWeightFilled}
          onCommit={(value) => {
            onWeight(entryKey, setIndex, value, entryUnit);
          }}
        />
        <NumberField
          label={`Set ${ordinal} ${measure === 'time' ? 'seconds' : amountName}`}
          value={amount}
          step={amountStep}
          min={0}
          max={amountMax}
          placeholder={amountPlaceholder}
          decimal={amountDecimal}
          disabled={skipped}
          onFilled={onRepsFilled}
          onCommit={(value) => {
            onAmount(entryKey, setIndex, value);
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

      {previousLabel === null && note === null && !showUnit && !isWarmup ? null : (
        <View style={[styles.meta, styles.info]}>
          {previousLabel === null ? null : (
            <Text style={[styles.small, { color: palette.dimmed }]}>last {previousLabel}</Text>
          )}
          {deltaLabel === null || deltaDirection === null ? null : (
            // Tap for what it adds up to: a load-for-reps trade-off cannot be
            // judged from either number on its own.
            <Pressable
              testID="set-delta"
              accessibilityRole="button"
              accessibilityHint="Explains the comparison"
              disabled={deltaDetail === null}
              hitSlop={8}
              onPress={() => {
                setExplained((current) => !current);
              }}
            >
              <Text
                style={[
                  styles.small,
                  styles.strong,
                  { color: deltaColor(deltaDirection, palette) },
                ]}
              >
                {deltaLabel}
              </Text>
            </Pressable>
          )}
          {isWarmup ? (
            <Text style={[styles.small, { color: palette.dimmed }]}>
              warmup · not in history or PRs
            </Text>
          ) : null}
          {note === null ? null : (
            <Text style={[styles.small, { color: palette.warn }]}>{note}</Text>
          )}
          {showUnit ? (
            <Text style={[styles.small, { color: palette.dimmed }]}>logged in {weightUnit}</Text>
          ) : null}
        </View>
      )}
      {explained && deltaDetail !== null ? (
        <Text style={[styles.small, styles.detail, { color: palette.dimmed }]}>{deltaDetail}</Text>
      ) : null}
    </View>
  );
}

export const SetRow = memo(SetRowBase);

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 6, paddingLeft: 6, borderLeftWidth: 3 },
  skipped: { opacity: 0.55 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ordinal: {
    width: 32,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordinalText: { fontSize: 15, fontWeight: '700' },
  // 48 wide: the most-pressed control on the screen gets the biggest target.
  tick: {
    width: 48,
    height: 44,
    borderWidth: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickText: { fontSize: 18, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 40,
  },
  info: { justifyContent: 'flex-start' },
  small: { fontSize: 12 },
  strong: { fontWeight: '700' },
  detail: { paddingLeft: 40 },
});
