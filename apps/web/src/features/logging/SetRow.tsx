import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { memo, useCallback, useState } from 'react';
import type { Measure } from '@lift/domain/measure';
import { MAX_LOAD } from '@lift/domain/sessions';
import type { SetAssessment } from '@lift/domain/sessions';
import type { Direction } from '@lift/domain/strength';
import type { Unit } from '@lift/domain/types';
import { stepFor } from '@lift/domain/units';
import { EffortField } from './EffortField';
import { NumberField } from './NumberField';
import classes from './SetRow.module.css';

/**
 * One set: load, reps, effort, and the toggle that finishes it.
 *
 * **Every prop is a primitive.** The session document is re-parsed into fresh
 * objects on every Firestore snapshot, so passing the `LoggedSet` through
 * would defeat `memo` on identity alone and re-render all fifty rows whenever
 * one of them was written. The parent formats the overlay strings — it
 * re-renders anyway — and this row only re-renders when one of its own values
 * actually changes (§3).
 *
 * The callbacks are stable for the life of the screen (they read the current
 * entries from a ref), so the default shallow comparison is correct.
 *
 * There is no add-a-set or delete-a-set control. The workout's prescription is
 * the plan; `skip` is how doing less gets recorded, and it keeps the row so
 * the gap stays visible.
 */

type Props = {
  entryKey: string;
  setIndex: number;
  /** 1-based position shown to the user; warmups are lettered instead. */
  ordinal: string;
  weight: number | null;
  /** The unit this set was stored in, which may differ from the display one. */
  weightUnit: Unit;
  /** What the second box holds: reps, seconds or a distance. */
  measure: Measure;
  /** The set's reps, seconds or distance (in the row's unit). */
  amount: number | null;
  amountPlaceholder: string;
  amountStep: number;
  amountMax: number;
  rir: number | null;
  /** The prescribed reps in reserve, so the target buttons can be marked. */
  rirTarget: { min: number; max: number } | null;
  isWarmup: boolean;
  skipped: boolean;
  isComplete: boolean;
  displayUnit: Unit;
  /** How the set landed against the prescribed target. */
  assessment: SetAssessment;
  /** The target, named in the off-target note so colour is never alone. */
  targetLabel: string | null;
  /** Last time's numbers for this set position, already formatted. */
  previousLabel: string | null;
  /** The delta chip, or null when there is nothing comparable to compare to. */
  deltaLabel: string | null;
  /** The whole comparison in words, including what the colour means. */
  deltaDetail: string | null;
  deltaDirection: Direction | null;
  onWeight: (entryKey: string, setIndex: number, value: number | null, unit: Unit) => void;
  onAmount: (entryKey: string, setIndex: number, value: number | null) => void;
  onRir: (entryKey: string, setIndex: number, value: number | null) => void;
  onToggleComplete: (entryKey: string, setIndex: number) => void;
  onToggleSkipped: (entryKey: string, setIndex: number) => void;
  onToggleWarmup: (entryKey: string, setIndex: number) => void;
};

const DELTA_COLOR: Record<Direction, string> = {
  up: 'var(--delta-up)',
  down: 'var(--delta-down)',
  same: 'var(--delta-same)',
};

/**
 * The note beside a row that needs attention.
 *
 * Always words as well as colour: red and green are the same colour to a
 * significant slice of people, and this screen gets read in bad gym light with
 * a phone at arm's length. An on-target set says nothing — the absence of a
 * complaint is the signal, and a green "on target" on every row would drown
 * the two that are not.
 *
 * `incomplete` outranks the rep range, and says which number is missing. It is
 * the more urgent of the two: a set missing its load or its reps cannot be
 * turned into an estimate, so it silently never reaches your history, and this
 * is the last moment the number can still be supplied.
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

/**
 * The assessment as the row currently stands, with the missing-number verdict
 * taken from what is typed rather than from what is committed. A rep range is
 * still judged on commit: half of a two-digit number is not an under-shoot.
 */
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
  deltaDetail,
  deltaDirection,
  onWeight,
  onAmount,
  onRir,
  onToggleComplete,
  onToggleSkipped,
  onToggleWarmup,
}: Props) {
  /**
   * A weight entered now is stored in the unit currently displayed — the
   * number typed is the number on the bar. A set logged earlier keeps the unit
   * it was entered in (§2.7), which is why the row can be annotated with a
   * unit that is not the display preference.
   */
  const entryUnit = weight === null ? displayUnit : weightUnit;
  const showUnit = weight !== null && weightUnit !== displayUnit;

  /**
   * Whether each box holds anything right now, reported by the fields as they
   * are typed. The numbers themselves still commit on blur. Each flag flips
   * at most once per box, so the row renders once when a box is first filled
   * and not once per digit (§3).
   */
  const [hasWeight, setHasWeight] = useState(weight !== null);
  const [hasReps, setHasReps] = useState(amount !== null);
  const onWeightFilled = useCallback((filled: boolean) => {
    setHasWeight(filled);
  }, []);
  const onRepsFilled = useCallback((filled: boolean) => {
    setHasReps(filled);
  }, []);

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

  return (
    <div
      className={classes.row}
      // Drives the row's edge marker. Only ever set for a set that has been
      // logged and judged, so an untouched row is never flagged.
      data-assessment={live === 'unassessed' ? undefined : live}
      data-skipped={skipped ? '' : undefined}
    >
      <Tooltip
        label={isWarmup ? 'Warmup — excluded from history and PRs' : 'Mark as a warmup'}
        withArrow
        openDelay={400}
      >
        <button
          type="button"
          className={classes.ordinal}
          aria-label={`Set ${ordinal}${isWarmup ? ', warmup' : ''}`}
          aria-pressed={isWarmup}
          onClick={() => {
            onToggleWarmup(entryKey, setIndex);
          }}
        >
          {ordinal}
        </button>
      </Tooltip>

      <div className={classes.inputs}>
        <NumberField
          label={`Set ${ordinal} weight`}
          value={weight}
          step={stepFor(entryUnit)}
          // Below zero is assistance: an assisted pull-up or dip machine.
          min={-MAX_LOAD}
          max={MAX_LOAD}
          start={0}
          placeholder={displayUnit}
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
          disabled={skipped}
          onFilled={onRepsFilled}
          onCommit={(value) => {
            onAmount(entryKey, setIndex, value);
          }}
        />
      </div>

      <ActionIcon
        variant={isComplete ? 'filled' : 'default'}
        size="lg"
        radius="xl"
        aria-label={isComplete ? `Set ${ordinal} done, undo` : `Complete set ${ordinal}`}
        aria-pressed={isComplete}
        disabled={skipped}
        onClick={() => {
          onToggleComplete(entryKey, setIndex);
        }}
      >
        ✓
      </ActionIcon>

      <div className={classes.meta}>
        <EffortField
          setLabel={`Set ${ordinal}`}
          value={rir}
          target={rirTarget}
          disabled={skipped}
          onChange={(value) => {
            onRir(entryKey, setIndex, value);
          }}
        />

        {previousLabel === null ? null : (
          <Text component="span" size="xs" c="dimmed" className={classes.previous}>
            {previousLabel}
          </Text>
        )}
        {deltaLabel === null || deltaDirection === null ? null : (
          /* The chip names what moved; the tooltip says what it adds up to,
             because a load-for-reps trade-off cannot be judged from either
             number on its own. */
          <Tooltip label={deltaDetail ?? deltaLabel} withArrow openDelay={200} multiline w={240}>
            <span
              data-testid="set-delta"
              className={classes.delta}
              style={{ color: DELTA_COLOR[deltaDirection] }}
              tabIndex={0}
            >
              {deltaLabel}
            </span>
          </Tooltip>
        )}
        {note === null ? null : (
          <span data-testid="set-note" className={classes.note}>
            {note}
          </span>
        )}
        {showUnit ? (
          <Text component="span" size="xs" c="dimmed">
            logged in {weightUnit}
          </Text>
        ) : null}

        <button
          type="button"
          className={classes.linkButton}
          onClick={() => {
            onToggleSkipped(entryKey, setIndex);
          }}
        >
          {skipped ? 'unskip' : 'skip'}
        </button>
      </div>
    </div>
  );
}

export const SetRow = memo(SetRowBase);
