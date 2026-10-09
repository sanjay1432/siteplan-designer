import { describe, expect, it } from "vitest";
import { tryParseDimension } from "./parser";
import { formatArchitectural, formatDimension } from "./formatter";

const mm = (input: string, unit: Parameters<typeof tryParseDimension>[1] = "ft") => {
  const result = tryParseDimension(input, unit);
  if (!result.success) throw new Error(result.error);
  return result.mm;
};

describe("tryParseDimension", () => {
  it("parses architectural feet-inches", () => {
    expect(mm(`58' 6"`)).toBeCloseTo(17830.8, 4);
    expect(mm(`58'-6 1/2"`)).toBeCloseTo(17843.5, 4);
    expect(mm("58 ft 6 in")).toBeCloseTo(17830.8, 4);
    expect(mm(`6 1/2"`)).toBeCloseTo(165.1, 4);
  });
  it("parses metric and bare numbers in the default unit", () => {
    expect(mm("17.6784 m")).toBeCloseTo(17678.4, 4);
    expect(mm("250cm")).toBe(2500);
    expect(mm("12", "m")).toBe(12000);
    expect(mm("12")).toBeCloseTo(3657.6, 4);
  });
  it("rejects unrecognised input", () => {
    expect(tryParseDimension("twelve feet").success).toBe(false);
  });
});

describe("formatting", () => {
  it("rounds architectural inches to the nearest 1/16 and carries 12 inches into feet", () => {
    expect(formatArchitectural(17830.8)).toBe(`58' 6"`);
    expect(formatArchitectural(304.8 * 3 - 0.5)).toBe(`3'`);
    expect(formatArchitectural(165.1)).toBe(`6 1/2"`);
  });
  it("formats metric values", () => {
    expect(formatDimension(17678.4, "meters", { decimals: 2 })).toBe("17.68 m");
    expect(formatDimension(2500, "millimetres")).toBe("2500 mm");
  });
});
