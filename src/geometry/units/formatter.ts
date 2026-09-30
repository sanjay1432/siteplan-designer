import {
  MM_PER_FOOT,
  MM_PER_INCH,
  MM_PER_METER,
} from "./units";
import type { DisplayFormat, FormatOptions } from "./types";

/**
 * Formats a fractional number (e.g. 6.5) to a clean fraction string (e.g. "6 1/2").
 */
export function formatFraction(value: number, maxDenominator = 16): string {
  const whole = Math.floor(value);
  const frac = value - whole;

  if (frac < 1 / (maxDenominator * 2)) {
    return whole > 0 ? `${whole}` : "0";
  }
  if (1 - frac < 1 / (maxDenominator * 2)) {
    return `${whole + 1}`;
  }

  let bestNum = 1;
  let bestDen = 2;
  let minDiff = 1;

  for (let den = 2; den <= maxDenominator; den *= 2) {
    const num = Math.round(frac * den);
    const diff = Math.abs(frac - num / den);
    if (diff < minDiff) {
      minDiff = diff;
      bestNum = num;
      bestDen = den;
    }
  }

  // Simplify fraction
  while (bestNum % 2 === 0 && bestDen % 2 === 0) {
    bestNum /= 2;
    bestDen /= 2;
  }

  if (bestNum === bestDen) {
    return `${whole + 1}`;
  }

  if (whole === 0) {
    return `${bestNum}/${bestDen}`;
  }

  return `${whole} ${bestNum}/${bestDen}`;
}

/**
 * Formats canonical millimetres into architectural feet and inches (e.g., 58' 6", 58', 6").
 */
export function formatArchitectural(
  mm: number,
  options?: FormatOptions,
): string {
  if (Math.abs(mm) < 0.1) return "0'";

  const isNegative = mm < 0;
  const absMm = Math.abs(mm);

  const totalInches = absMm / MM_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  const remainingInches = totalInches - feet * 12;

  const maxDenominator = options?.maxDenominator ?? 16;
  const roundedInchesStr = formatFraction(remainingInches, maxDenominator);

  let result: string;

  if (feet > 0) {
    if (!roundedInchesStr || roundedInchesStr === "0") {
      result = `${feet}'`;
    } else if (roundedInchesStr === "12") {
      result = `${feet + 1}'`;
    } else {
      result = `${feet}' ${roundedInchesStr}"`;
    }
  } else {
    if (!roundedInchesStr || roundedInchesStr === "0") {
      result = "0'";
    } else {
      result = `${roundedInchesStr}"`;
    }
  }

  return isNegative ? `-${result}` : result;
}

/**
 * Formats canonical millimetres into decimal feet (e.g., 58.50 ft).
 */
export function formatDecimalFeet(
  mm: number,
  decimals = 2,
  showUnit = true,
): string {
  const feet = mm / MM_PER_FOOT;
  const unitSuffix = showUnit ? " ft" : "'";
  return `${feet.toFixed(decimals)}${unitSuffix}`;
}

/**
 * Formats canonical millimetres into metric meters (e.g., 17.68 m).
 */
export function formatMeters(
  mm: number,
  decimals = 3,
  showUnit = true,
): string {
  const meters = mm / MM_PER_METER;
  const unitSuffix = showUnit ? " m" : "";
  return `${meters.toFixed(decimals)}${unitSuffix}`;
}

/**
 * Formats canonical millimetres into millimetres (e.g., 17678.4 mm).
 */
export function formatMillimetres(
  mm: number,
  decimals = 1,
  showUnit = true,
): string {
  const unitSuffix = showUnit ? " mm" : "";
  if (Math.abs(mm - Math.round(mm)) < 1e-4) {
    return `${Math.round(mm)}${unitSuffix}`;
  }
  return `${mm.toFixed(decimals)}${unitSuffix}`;
}

/**
 * Dispatches dimension formatting to the appropriate representation.
 */
export function formatDimension(
  mm: number,
  format: DisplayFormat = "architectural",
  options?: FormatOptions,
): string {
  switch (format) {
    case "architectural":
      return formatArchitectural(mm, options);
    case "decimal_feet":
      return formatDecimalFeet(mm, options?.decimals ?? 1, options?.showUnit ?? true);
    case "meters":
      return formatMeters(mm, options?.decimals ?? 3, options?.showUnit ?? true);
    case "millimetres":
      return formatMillimetres(mm, options?.decimals ?? 1, options?.showUnit ?? true);
    default:
      return formatArchitectural(mm, options);
  }
}
