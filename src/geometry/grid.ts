/** Grid spacings in millimetres; the canvas picks the finest one that stays legible at the current zoom. */
const IMPERIAL_CANDIDATES = [
  25.4,       // 1 inch
  76.2,       // 3 inch
  152.4,      // 6 inch
  304.8,      // 1 ft
  609.6,      // 2 ft
  1524,       // 5 ft
  3048,       // 10 ft
  6096,       // 20 ft
  15240,      // 50 ft
  30480,      // 100 ft
  60960,      // 200 ft
  152400,     // 500 ft
];

const METRIC_CANDIDATES = [
  10,         // 10 mm
  20,         // 20 mm
  50,         // 50 mm
  100,        // 100 mm (10 cm)
  200,        // 200 mm
  500,        // 500 mm (0.5 m)
  1000,       // 1 m
  2000,       // 2 m
  5000,       // 5 m
  10000,      // 10 m
  20000,      // 20 m
  50000,      // 50 m
  100000,     // 100 m
];

export function getGridStep(
  zoom: number,
  unitSystem: "imperial" | "metric",
): number {
  const candidates =
    unitSystem === "metric" ? METRIC_CANDIDATES : IMPERIAL_CANDIDATES;

  const minimumScreenSpacing = 30;

  for (const candidate of candidates) {
    if (candidate * zoom >= minimumScreenSpacing) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}
