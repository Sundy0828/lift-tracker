import { useEffect, useRef } from 'react';
import classes from './SetRow.module.css';

/**
 * One uncontrolled number input in the set grid.
 *
 * **Uncontrolled on purpose (§3).** The active-session screen is the hot path:
 * a controlled input would put a state update, a Firestore write and a re-render
 * of the whole entry on every keystroke, and the INP budget is 100 ms. Here,
 * typing touches nothing but the DOM node, and the value commits on blur or on
 * a stepper press — one write per set, not one per digit.
 *
 * A plain `<input>` rather than Mantine's `NumberInput` for the same reason:
 * a session has upwards of fifty of these, and the component's controlled
 * value, formatter and wrapper elements are all cost on the one screen that
 * cannot afford it. Touch sizing lives in the CSS module instead.
 *
 * `type="number"` for what it gives back: arrow keys step the value, and
 * assistive technology announces a spinbutton with its range rather than a
 * text box. Its two liabilities are dealt with rather than tolerated — the
 * native spinners are removed in CSS because the row already has bigger ones,
 * and a scroll wheel over a focused field blurs it instead of silently
 * changing a logged weight.
 */

type Props = {
  label: string;
  value: number | null;
  /** Stepper increment. The unit's natural plate increment, for a load. */
  step: number;
  min: number;
  max: number;
  placeholder?: string;
  disabled?: boolean;
  /** Called on blur and on every stepper press, never per keystroke. */
  onCommit: (value: number | null) => void;
};

function format(value: number | null): string {
  if (value === null) return '';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function parse(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function NumberField({
  label,
  value,
  step,
  min,
  max,
  placeholder,
  disabled = false,
  onCommit,
}: Props) {
  const input = useRef<HTMLInputElement>(null);

  /**
   * Pushes an externally changed value into the DOM — a set prefilled by
   * "add set", or an edit that arrived from another device.
   *
   * Skipped while the field has focus, which is what keeps an uncontrolled
   * input from fighting the person typing in it: a write echoing back from
   * Firestore mid-word would otherwise reset the caret.
   */
  useEffect(() => {
    const node = input.current;
    if (node === null || document.activeElement === node) return;

    const next = format(value);
    if (node.value !== next) node.value = next;
  }, [value]);

  const commit = (next: number | null): void => {
    const bounded = next === null ? null : clamp(next, min, max);
    if (input.current !== null) input.current.value = format(bounded);
    if (bounded !== value) onCommit(bounded);
  };

  const nudge = (direction: 1 | -1): void => {
    const current = parse(input.current?.value ?? '') ?? value;
    // Stepping from empty starts at the minimum rather than at zero-plus-step,
    // so the first tap on a fresh RIR field gives 0 and not 1.
    const base = current ?? min - step * direction;
    commit(Math.round((base + step * direction) / step) * step);
  };

  return (
    <div className={classes.field}>
      <button
        type="button"
        aria-label={`${label} down`}
        className={classes.step}
        disabled={disabled}
        onClick={() => {
          nudge(-1);
        }}
      >
        −
      </button>
      <input
        ref={input}
        className={classes.input}
        type="number"
        // Still declared: it picks the decimal keypad on phones whose
        // number-input keyboard omits the separator.
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        enterKeyHint="next"
        autoComplete="off"
        aria-label={label}
        defaultValue={format(value)}
        placeholder={placeholder ?? ''}
        disabled={disabled}
        onBlur={(event) => {
          commit(parse(event.currentTarget.value));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onWheel={(event) => {
          // Scrolling the page with the cursor over a focused number input
          // otherwise changes the value, which on this screen means silently
          // rewriting a set you already logged. Blurring commits what is there
          // and takes the field out of the wheel's reach.
          if (document.activeElement === event.currentTarget) event.currentTarget.blur();
        }}
      />
      <button
        type="button"
        aria-label={`${label} up`}
        className={classes.step}
        disabled={disabled}
        onClick={() => {
          nudge(1);
        }}
      >
        +
      </button>
    </div>
  );
}
