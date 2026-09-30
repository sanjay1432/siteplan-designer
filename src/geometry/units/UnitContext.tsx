import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { readStoredValue, writeStoredValue } from "../../lib/persistence";
import type { DisplayFormat, FormatOptions, ParseResult, UnitSystem } from "./types";
import { formatDimension } from "./formatter";
import { parseDimension, tryParseDimension } from "./parser";

interface UnitContextValue {
  unitSystem: UnitSystem;
  displayFormat: DisplayFormat;
  setUnitSystem: (system: UnitSystem) => void;
  setDisplayFormat: (format: DisplayFormat) => void;
  format: (mm: number, options?: FormatOptions) => string;
  parse: (text: string) => number;
  tryParse: (text: string) => ParseResult;
}

const UnitContext = createContext<UnitContextValue | null>(null);
const UNIT_PREFERENCES_KEY = "siteplan-designer:unit-preferences:v1";

interface UnitPreferences {
  unitSystem: UnitSystem;
  displayFormat: DisplayFormat;
}

function isUnitPreferences(value: unknown): value is UnitPreferences {
  if (!value || typeof value !== "object") return false;
  const preferences = value as Record<string, unknown>;
  return (
    (preferences.unitSystem === "imperial" || preferences.unitSystem === "metric") &&
    (preferences.unitSystem === "imperial"
      ? preferences.displayFormat === "architectural" ||
        preferences.displayFormat === "decimal_feet"
      : preferences.displayFormat === "meters" ||
        preferences.displayFormat === "millimetres")
  );
}

export function UnitProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UnitPreferences>(() => {
    const saved = readStoredValue(UNIT_PREFERENCES_KEY, isUnitPreferences, {
      unitSystem: "imperial" as const,
      displayFormat: "decimal_feet" as const,
    });
    // Use easy-to-read decimal feet for imperial dimensions by default,
    // including existing browser preferences from earlier versions.
    return saved.unitSystem === "imperial"
      ? { ...saved, displayFormat: "decimal_feet" }
      : saved;
  });
  const { unitSystem, displayFormat } = preferences;

  useEffect(() => {
    writeStoredValue(UNIT_PREFERENCES_KEY, preferences);
  }, [preferences]);

  const setUnitSystem = useCallback((system: UnitSystem) => {
    setPreferences({
      unitSystem: system,
      displayFormat: system === "metric" ? "meters" : "decimal_feet",
    });
  }, []);

  const setDisplayFormat = useCallback((format: DisplayFormat) => {
    setPreferences((current) => ({ ...current, displayFormat: format }));
  }, []);

  const format = useCallback(
    (mm: number, options?: FormatOptions) => {
      const activeFormat = options?.format ?? displayFormat;
      return formatDimension(mm, activeFormat, options);
    },
    [displayFormat],
  );

  const parse = useCallback(
    (text: string) => {
      const defaultUnit = unitSystem === "metric" ? "m" : "ft";
      return parseDimension(text, defaultUnit);
    },
    [unitSystem],
  );

  const tryParse = useCallback(
    (text: string) => {
      const defaultUnit = unitSystem === "metric" ? "m" : "ft";
      return tryParseDimension(text, defaultUnit);
    },
    [unitSystem],
  );

  return (
    <UnitContext.Provider
      value={{
        unitSystem,
        displayFormat,
        setUnitSystem,
        setDisplayFormat,
        format,
        parse,
        tryParse,
      }}
    >
      {children}
    </UnitContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUnits() {
  const context = useContext(UnitContext);
  if (!context) {
    throw new Error("useUnits must be used within a UnitProvider");
  }
  return context;
}
