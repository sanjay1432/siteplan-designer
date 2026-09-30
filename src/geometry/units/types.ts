export type UnitSystem = "imperial" | "metric";

export type LengthUnit = "ft" | "in" | "m" | "cm" | "mm";

export type DisplayFormat =
  | "architectural"   // 58' 6" or 58' 6 1/2"
  | "decimal_feet"    // 58.50 ft
  | "meters"          // 17.68 m
  | "millimetres";    // 17678.4 mm

export interface FormatOptions {
  format?: DisplayFormat;
  maxDenominator?: number; // 2, 4, 8, 16 (default 16)
  decimals?: number;       // for decimal feet, meters, mm
  showUnit?: boolean;
}

export type ParseResult =
  | {
      success: true;
      mm: number;
      raw: string;
      detectedUnit: LengthUnit | "architectural" | "mixed";
    }
  | {
      success: false;
      error: string;
      raw: string;
    };
