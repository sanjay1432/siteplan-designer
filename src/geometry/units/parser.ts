import {
  MM_PER_CM,
  MM_PER_FOOT,
  MM_PER_INCH,
  MM_PER_METER,
  normalizeMm,
} from "./units";
import type { LengthUnit, ParseResult } from "./types";

/**
 * Parses fractional strings like "1/2", "3/4", "6 1/2", "6-1/2" into a decimal number.
 */
function parseFractionString(str: string): number | null {
  const trimmed = str.trim();
  const fracMatch = trimmed.match(/^(?:(\d+)\s*(?:[\s-])\s*)?(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const whole = fracMatch[1] ? Number(fracMatch[1]) : 0;
    const numerator = Number(fracMatch[2]);
    const denominator = Number(fracMatch[3]);
    if (denominator === 0) return null;
    return whole + numerator / denominator;
  }
  return null;
}

/**
 * Attempts to parse a user-input dimension string into canonical millimetres.
 * Returns a ParseResult object with success flag and detail.
 */
export function tryParseDimension(
  value: string,
  defaultUnit: LengthUnit = "ft",
): ParseResult {
  const input = value.trim();

  if (!input) {
    return {
      success: true,
      mm: 0,
      raw: value,
      detectedUnit: defaultUnit,
    };
  }

  // 1. Millimetres: e.g. "17678.4 mm", "17678.4mm"
  const mmMatch = input.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:mm|millimet(?:er|re)s?)$/i,
  );
  if (mmMatch) {
    return {
      success: true,
      mm: normalizeMm(Number(mmMatch[1])),
      raw: value,
      detectedUnit: "mm",
    };
  }

  // 2. Centimetres: e.g. "1767.84 cm", "1767.84cm"
  const cmMatch = input.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:cm|centimet(?:er|re)s?)$/i,
  );
  if (cmMatch) {
    return {
      success: true,
      mm: normalizeMm(Number(cmMatch[1]) * MM_PER_CM),
      raw: value,
      detectedUnit: "cm",
    };
  }

  // 3. Metres: e.g. "17.6784 m", "17.6784m", "17.6784 meters"
  const mMatch = input.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:m|met(?:er|re)s?)$/i,
  );
  if (mMatch) {
    return {
      success: true,
      mm: normalizeMm(Number(mMatch[1]) * MM_PER_METER),
      raw: value,
      detectedUnit: "m",
    };
  }

  // 4. Feet and Inches:
  // e.g. 58' 6", 58'6", 58'-6", 58 ft 6 in, 58' 6 1/2", 58'-6 1/2", 58' 6.5"
  const feetInchesMatch = input.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*[-]?\s*(\d+(?:\.\d+)?(?:\s+[-]?\s*\d+\s*\/\s*\d+|\s*\/\s*\d+)?|\d+\s*\/\s*\d+)\s*(?:"|in|inches)?$/i,
  );
  if (feetInchesMatch) {
    const feet = Number(feetInchesMatch[1]);
    const inchesPart = feetInchesMatch[2].trim();
    let inches: number;

    const frac = parseFractionString(inchesPart);
    if (frac !== null) {
      inches = frac;
    } else {
      inches = Number(inchesPart);
      if (isNaN(inches)) {
        return {
          success: false,
          error: `Invalid inch portion: "${inchesPart}"`,
          raw: value,
        };
      }
    }

    const sign = feet < 0 ? -1 : 1;
    const totalMm = sign * (Math.abs(feet) * MM_PER_FOOT + inches * MM_PER_INCH);

    return {
      success: true,
      mm: normalizeMm(totalMm),
      raw: value,
      detectedUnit: "architectural",
    };
  }

  // 5. Feet only: e.g. 58', 58 ft, 58.5 ft, 58.5'
  const feetMatch = input.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)$/i,
  );
  if (feetMatch) {
    return {
      success: true,
      mm: normalizeMm(Number(feetMatch[1]) * MM_PER_FOOT),
      raw: value,
      detectedUnit: "ft",
    };
  }

  // 6. Inches with fractions: e.g. 6 1/2", 1/2", 6-1/2 in
  const inchFracMatch = input.match(
    /^(?:(\d+)\s*(?:[\s-])\s*)?(\d+)\s*\/\s*(\d+)\s*(?:"|in|inches)?$/i,
  );
  if (inchFracMatch) {
    const whole = inchFracMatch[1] ? Number(inchFracMatch[1]) : 0;
    const numerator = Number(inchFracMatch[2]);
    const denominator = Number(inchFracMatch[3]);
    if (denominator === 0) {
      return {
        success: false,
        error: "Division by zero in inch fraction",
        raw: value,
      };
    }
    const inches = whole + numerator / denominator;
    return {
      success: true,
      mm: normalizeMm(inches * MM_PER_INCH),
      raw: value,
      detectedUnit: "in",
    };
  }

  // 7. Inches only: e.g. 58", 58 in, 58.5 inches
  const inchesMatch = input.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:"|in|inches)$/i,
  );
  if (inchesMatch) {
    return {
      success: true,
      mm: normalizeMm(Number(inchesMatch[1]) * MM_PER_INCH),
      raw: value,
      detectedUnit: "in",
    };
  }

  // 8. Bare decimal / integer number: uses defaultUnit
  const rawNumberMatch = input.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (rawNumberMatch) {
    const num = Number(rawNumberMatch[1]);
    let mm: number;
    if (defaultUnit === "m") {
      mm = num * MM_PER_METER;
    } else if (defaultUnit === "mm") {
      mm = num;
    } else if (defaultUnit === "cm") {
      mm = num * MM_PER_CM;
    } else if (defaultUnit === "in") {
      mm = num * MM_PER_INCH;
    } else {
      // Default is feet for site planning
      mm = num * MM_PER_FOOT;
    }

    return {
      success: true,
      mm: normalizeMm(mm),
      raw: value,
      detectedUnit: defaultUnit,
    };
  }

  return {
    success: false,
    error: `Unrecognized dimension format: "${value}". Expected formats: 58', 58' 6", 58.5 ft, 17.6784 m, or 17678.4 mm.`,
    raw: value,
  };
}

/**
 * Parses a dimension string into canonical millimetres.
 * Throws an Error if the format cannot be parsed.
 */
export function parseDimension(
  value: string,
  defaultUnit: LengthUnit = "ft",
): number {
  const result = tryParseDimension(value, defaultUnit);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.mm;
}