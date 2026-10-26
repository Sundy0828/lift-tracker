import type { Unit, Weight } from './types';
import { UNITS } from './types';

/** Exact international avoirdupois pound. */
const KG_PER_LB = 0.45359237;

/** Smallest load increment worth stepping by, per unit. */
const STEP: Record<Unit, number> = { lb: 2.5, kg: 1.25 };

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

/** kg is the single internal unit for all comparison, e1RM, and PR math. */
export function toKg(weight: Weight): number {
  return weight.unit === 'kg' ? weight.value : weight.value * KG_PER_LB;
}

export function fromKg(kilograms: number, unit: Unit): number {
  return unit === 'kg' ? kilograms : kilograms / KG_PER_LB;
}

export function convert(weight: Weight, to: Unit): Weight {
  if (weight.unit === to) return weight;
  return { value: fromKg(toKg(weight), to), unit: to };
}

export function stepFor(unit: Unit): number {
  return STEP[unit];
}

/** Snaps a value to the unit's natural plate increment. */
export function roundToStep(value: number, unit: Unit): number {
  const step = STEP[unit];
  return roundTo(Math.round(value / step) * step, 4);
}

/**
 * Converts for display and snaps to the target unit's increment. Use for
 * prefilling inputs — never for storage, which keeps the value as entered.
 */
export function convertForInput(weight: Weight, to: Unit): Weight {
  if (weight.unit === to) return weight;
  return { value: roundToStep(fromKg(toKg(weight), to), to), unit: to };
}

export type FormatWeightOptions = {
  /** Append the unit, e.g. `185 lb`. @default true */
  withUnit?: boolean;
  /** Maximum decimal places kept. @default 1 */
  maxDecimals?: number;
};

/**
 * Renders a stored weight in the user's display unit. A weight stored in the
 * other unit is converted, so history logged in lb reads correctly in kg.
 */
export function formatWeight(
  weight: Weight,
  displayUnit: Unit,
  options: FormatWeightOptions = {},
): string {
  const { withUnit = true, maxDecimals = 1 } = options;
  const shown = convert(weight, displayUnit);
  const number = formatNumber(shown.value, maxDecimals);
  return withUnit ? `${number} ${displayUnit}` : number;
}

/** True when a row needs its own unit shown because it differs from the display preference. */
export function needsUnitAnnotation(weight: Weight, displayUnit: Unit): boolean {
  return weight.unit !== displayUnit;
}

export function formatNumber(value: number, maxDecimals = 1): string {
  const rounded = roundTo(value, maxDecimals);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(maxDecimals);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
