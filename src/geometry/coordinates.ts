export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

export function feetToMm(feet: number): number {
  return feet * MM_PER_FOOT;
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

export function mmToFeet(mm: number): number {
  return mm / MM_PER_FOOT;
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}