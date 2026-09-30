import type { UnitSystem } from "./types";

/**
 * Fundamental Physical Conversion Constants
 * Canonical geometry unit is always MILLIMETRES.
 */
export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;
export const MM_PER_METER = 1000;
export const MM_PER_CM = 10;
export const INCHES_PER_FOOT = 12;

export const SQ_MM_PER_SQ_FOOT = MM_PER_FOOT * MM_PER_FOOT; // 92903.04 mm²
export const SQ_MM_PER_SQ_METER = MM_PER_METER * MM_PER_METER; // 1,000,000 mm²

/**
 * Normalizes a millimetre value to 4 decimal places (0.0001 mm / 0.1 µm)
 * to prevent IEEE-754 floating-point drift (e.g. 58 * 304.8 + 6 * 25.4).
 */
export function normalizeMm(mm: number): number {
  return Math.round(mm * 10000) / 10000;
}

// Length Conversions to Millimetres
export function feetToMm(feet: number): number {
  return normalizeMm(feet * MM_PER_FOOT);
}

export function inchesToMm(inches: number): number {
  return normalizeMm(inches * MM_PER_INCH);
}

export function metersToMm(meters: number): number {
  return normalizeMm(meters * MM_PER_METER);
}

export function cmToMm(cm: number): number {
  return normalizeMm(cm * MM_PER_CM);
}

export function feetAndInchesToMm(feet: number, inches: number): number {
  return normalizeMm(feet * MM_PER_FOOT + inches * MM_PER_INCH);
}

// Length Conversions from Millimetres
export function mmToFeet(mm: number): number {
  return mm / MM_PER_FOOT;
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function mmToMeters(mm: number): number {
  return mm / MM_PER_METER;
}

export function mmToCm(mm: number): number {
  return mm / MM_PER_CM;
}

export function mmToFeetAndInches(mm: number): {
  feet: number;
  inches: number;
} {
  const totalInches = mm / MM_PER_INCH;
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = totalInches - feet * INCHES_PER_FOOT;
  return { feet, inches };
}

// Area Conversions from mm²
export function sqMmToSqFeet(sqMm: number): number {
  return sqMm / SQ_MM_PER_SQ_FOOT;
}

export function sqMmToSqMeters(sqMm: number): number {
  return sqMm / SQ_MM_PER_SQ_METER;
}

export function formatArea(sqMm: number, system: UnitSystem = "imperial"): string {
  if (system === "metric") {
    const sqM = sqMmToSqMeters(sqMm);
    return `${sqM.toFixed(2)} m²`;
  }
  const sqFt = sqMmToSqFeet(sqMm);
  return `${sqFt.toFixed(1)} sq ft`;
}