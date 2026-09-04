import type { SignalValue } from "./types.js";

export function isSignalValue(value: unknown): value is SignalValue {
  if (!value || typeof value !== "object" || typeof (value as { kind?: unknown }).kind !== "string") return false;
  const signal = value as Record<string, unknown>;
  switch (signal.kind) {
    case "digital": return ["LOW", "HIGH", "UNKNOWN", "HIGH_IMPEDANCE"].includes(String(signal.level));
    case "analog": return Number.isFinite(signal.value) && typeof signal.unit === "string";
    case "pwm": return Number.isFinite(signal.dutyCycle) && Number(signal.dutyCycle) >= 0 && Number(signal.dutyCycle) <= 1 && Number.isFinite(signal.frequencyHz) && Number(signal.frequencyHz) >= 0;
    case "pulse": return Number.isFinite(signal.frequencyHz) && Number(signal.frequencyHz) >= 0 && (signal.level === undefined || signal.level === "LOW" || signal.level === "HIGH");
    case "bytes": return Array.isArray(signal.value) && signal.value.every(item => Number.isInteger(item) && item >= 0 && item <= 255);
    case "data": return isLogicalValue(signal.value);
    default: return false;
  }
}
function isLogicalValue(value: unknown): boolean {
  if (value === null || ["boolean", "string"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isLogicalValue);
  return typeof value === "object" && value !== null && Object.values(value).every(isLogicalValue);
}
export const signalEquals = (a: SignalValue | undefined, b: SignalValue | undefined): boolean => canonical(a) === canonical(b);
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`; return JSON.stringify(value); }
export const digital = (level: "LOW" | "HIGH" | "UNKNOWN" | "HIGH_IMPEDANCE"): SignalValue => ({ kind: "digital", level });
export const analog = (value: number, unit = "V"): SignalValue => ({ kind: "analog", value, unit });
export const pwm = (dutyCycle: number, frequencyHz: number): SignalValue => ({ kind: "pwm", dutyCycle, frequencyHz });
