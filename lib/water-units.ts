import type { WaterUnit } from "@/lib/db";

export const ML_PER_GLASS = 237;
export const ML_PER_OZ = 29.57;
export const ML_PER_LITER = 1000;

export const WATER_UNITS: WaterUnit[] = ["glasses", "oz", "liters"];

export function toMl(amount: number, unit: WaterUnit): number {
  if (unit === "oz") return amount * ML_PER_OZ;
  if (unit === "glasses") return amount * ML_PER_GLASS;
  return amount * ML_PER_LITER;
}

export function fromMl(ml: number, unit: WaterUnit): number {
  if (ml <= 0) return 0;
  if (unit === "oz") return ml / ML_PER_OZ;
  if (unit === "glasses") return ml / ML_PER_GLASS;
  return ml / ML_PER_LITER;
}

export function convertWater(
  amount: number,
  from: WaterUnit,
  to: WaterUnit,
): number {
  if (from === to) return amount;
  return fromMl(toMl(amount, from), to);
}

export function nextWaterUnit(unit: WaterUnit): WaterUnit {
  const idx = WATER_UNITS.indexOf(unit);
  return WATER_UNITS[(idx + 1) % WATER_UNITS.length];
}

export function formatWaterAmount(n: number, unit: WaterUnit): string {
  if (!Number.isFinite(n)) return "0";
  if (unit === "liters") {
    const rounded = Math.round(n * 100) / 100;
    return rounded.toFixed(rounded < 1 ? 2 : 1);
  }
  const rounded = Math.round(n * 10) / 10;
  return rounded.toString();
}
