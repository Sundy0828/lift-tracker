import classes from './SetRow.module.css';

/**
 * How hard the set was, as four tap targets instead of a typed number.
 *
 * RIR is a judgement, not a measurement. Asking for it as a free number
 * invites false precision — nobody knows the difference between 2 and 3 reps
 * in reserve well enough to type it mid-set — and it costs a keypad, a
 * keystroke and a blur for a value that only ever takes a handful of values in
 * practice. Four buttons are one tap, and they read as what they are: did you
 * stop at failure, or could you have done one, two, or several more.
 *
 * What is *stored* is still the plain RIR number, so the RIR-adjusted 1RM,
 * every delta and PR detection all keep working on a real figure, and a logged
 * set stays comparable to the target RIR range the workout prescribes.
 *
 * `3+` stores 3. Above that the estimate stops meaning much anyway: a set with
 * four or more reps left is not close enough to failure to say much about
 * capacity, and lumping those together is more honest than pretending to tell
 * 4 from 6.
 */

/** The stored RIR behind each button, in order. */
const STEPS = [0, 1, 2, 3] as const;

const LABELS: Record<number, string> = { 0: 'fail', 1: '1', 2: '2', 3: '3+' };

const DESCRIPTIONS: Record<number, string> = {
  0: 'to failure, no reps left',
  1: '1 rep left',
  2: '2 reps left',
  3: '3 or more reps left',
};

type Props = {
  /** For the accessible name, e.g. "Set 2". */
  setLabel: string;
  value: number | null;
  /** The prescribed RIR range, so the target can be marked. */
  target: { min: number; max: number } | null;
  disabled?: boolean;
  onChange: (rir: number | null) => void;
};

export function EffortField({ setLabel, value, target, disabled = false, onChange }: Props) {
  return (
    <div className={classes.effort} role="group" aria-label={`${setLabel} effort, reps in reserve`}>
      {STEPS.map((step) => {
        const selected = value === step;
        // `3+` stands for everything from 3 up, so a prescription of 3-4 RIR
        // marks it as on target rather than marking nothing at all.
        const inTarget =
          target !== null &&
          (step === 3 ? target.max >= 3 : step >= target.min && step <= target.max);

        return (
          <button
            key={step}
            type="button"
            className={classes.effortStep}
            aria-label={`${setLabel}: ${DESCRIPTIONS[step] ?? String(step)}`}
            aria-pressed={selected}
            data-target={inTarget ? '' : undefined}
            disabled={disabled}
            onClick={() => {
              // Tapping the chosen one again clears it. There is no other way
              // back to "not recorded", and a mis-tap should be undoable.
              onChange(selected ? null : step);
            }}
          >
            {LABELS[step] ?? String(step)}
          </button>
        );
      })}
    </div>
  );
}
