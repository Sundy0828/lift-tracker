import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { memo } from 'react';
import { MAX_REPS, MAX_RIR } from '@/domain/workouts';
import type { Direction } from '@/domain/strength';
import type { Unit } from '@/domain/types';
import { stepFor } from '@/domain/units';
import { NumberField } from './NumberField';
import classes from './SetRow.module.css';

/**
 * One set: load, reps, RIR, and the toggle that finishes it.
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
 */

type Props = {
  entryKey: string;
  setIndex: number;
  /** 1-based position shown to the user; warmups are lettered instead. */
  ordinal: string;
  weight: number | null;
  /** The unit this set was stored in, which may differ from the display one. */
  weightUnit: Unit;
  reps: number | null;
  rir: number | null;
  isWarmup: boolean;
  skipped: boolean;
  isComplete: boolean;
  displayUnit: Unit;
  /** Last time's numbers for this set position, already formatted. */
  previousLabel: string | null;
  /** The delta chip, or null when there is nothing comparable to compare to. */
  deltaLabel: string | null;
  deltaDirection: Direction | null;
  onWeight: (entryKey: string, setIndex: number, value: number | null, unit: Unit) => void;
  onReps: (entryKey: string, setIndex: number, value: number | null) => void;
  onRir: (entryKey: string, setIndex: number, value: number | null) => void;
  onToggleComplete: (entryKey: string, setIndex: number) => void;
  onToggleSkipped: (entryKey: string, setIndex: number) => void;
  onToggleWarmup: (entryKey: string, setIndex: number) => void;
  onRemove: (entryKey: string, setIndex: number) => void;
};

const DELTA_COLOR: Record<Direction, string> = {
  up: 'var(--delta-up)',
  down: 'var(--delta-down)',
  same: 'var(--delta-same)',
};

function SetRowBase({
  entryKey,
  setIndex,
  ordinal,
  weight,
  weightUnit,
  reps,
  rir,
  isWarmup,
  skipped,
  isComplete,
  displayUnit,
  previousLabel,
  deltaLabel,
  deltaDirection,
  onWeight,
  onReps,
  onRir,
  onToggleComplete,
  onToggleSkipped,
  onToggleWarmup,
  onRemove,
}: Props) {
  /**
   * A weight entered now is stored in the unit currently displayed — the
   * number typed is the number on the bar. A set logged earlier keeps the unit
   * it was entered in (§2.7), which is why the row can be annotated with a
   * unit that is not the display preference.
   */
  const entryUnit = weight === null ? displayUnit : weightUnit;
  const showUnit = weight !== null && weightUnit !== displayUnit;

  return (
    <div className={`${classes.row} ${skipped ? classes.skipped : ''}`}>
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
          min={0}
          max={2000}
          placeholder={displayUnit}
          disabled={skipped}
          onCommit={(value) => {
            onWeight(entryKey, setIndex, value, entryUnit);
          }}
        />
        <NumberField
          label={`Set ${ordinal} reps`}
          value={reps}
          step={1}
          min={0}
          max={MAX_REPS}
          placeholder="reps"
          disabled={skipped}
          onCommit={(value) => {
            onReps(entryKey, setIndex, value);
          }}
        />
        <NumberField
          label={`Set ${ordinal} RIR`}
          value={rir}
          step={1}
          min={0}
          max={MAX_RIR}
          placeholder="RIR"
          disabled={skipped}
          onCommit={(value) => {
            onRir(entryKey, setIndex, value);
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
        {previousLabel === null ? null : (
          <Text component="span" size="xs" c="dimmed" className={classes.previous}>
            {previousLabel}
          </Text>
        )}
        {deltaLabel === null || deltaDirection === null ? null : (
          <span
            data-testid="set-delta"
            className={classes.delta}
            style={{ color: DELTA_COLOR[deltaDirection] }}
          >
            {deltaLabel}
          </span>
        )}
        {showUnit ? (
          <Text component="span" size="xs" c="dimmed">
            logged in {weightUnit}
          </Text>
        ) : null}
        <span className={classes.rowActions}>
          <button
            type="button"
            className={classes.linkButton}
            onClick={() => {
              onToggleSkipped(entryKey, setIndex);
            }}
          >
            {skipped ? 'unskip' : 'skip'}
          </button>
          <button
            type="button"
            className={classes.linkButton}
            onClick={() => {
              onRemove(entryKey, setIndex);
            }}
          >
            remove
          </button>
        </span>
      </div>
    </div>
  );
}

export const SetRow = memo(SetRowBase);
