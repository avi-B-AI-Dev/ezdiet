import type { WaterUnit } from "@/lib/db";

const OZ_PER_GLASS = 8;
const OZ_PER_LITER = 33.814;

export const WATER_UNITS: WaterUnit[] = ["glasses", "oz", "liters"];

export function toOz(amount: number, unit: WaterUnit): number {
  if (unit === "oz") return amount;
  if (unit === "glasses") return amount * OZ_PER_GLASS;
  return amount * OZ_PER_LITER;
}

export function fromOz(oz: number, unit: WaterUnit): number {
  if (unit === "oz") return oz;
  if (unit === "glasses") return oz / OZ_PER_GLASS;
  return oz / OZ_PER_LITER;
}

export function convertWater(
  amount: number,
  from: WaterUnit,
  to: WaterUnit,
): number {
  if (from === to) return amount;
  return fromOz(toOz(amount, from), to);
}

export function nextWaterUnit(unit: WaterUnit): WaterUnit {
  const idx = WATER_UNITS.indexOf(unit);
  return WATER_UNITS[(idx + 1) % WATER_UNITS.length];
}

export function formatWater(amount: number, unit: WaterUnit): string {
  const rounded = unit === "liters" ? amount.toFixed(1) : String(Math.round(amount * 10) / 10);
  return `${rounded} ${unit}`;
}
