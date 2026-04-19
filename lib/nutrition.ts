export type Gender = "male" | "female" | "other";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active";
export type CompositionGoal =
  | "lose_fat"
  | "build_muscle"
  | "maintain"
  | "recomp";

export type DietStyle =
  | "balanced"
  | "high_protein"
  | "keto"
  | "low_carb"
  | "custom";

export type MacroRatio = {
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
};

export const DIET_STYLES: Record<
  Exclude<DietStyle, "custom">,
  MacroRatio & { label: string; description: string }
> = {
  balanced: {
    label: "Balanced",
    description: "30% protein · 40% carbs · 30% fat",
    proteinPct: 30,
    carbsPct: 40,
    fatPct: 30,
  },
  high_protein: {
    label: "High Protein",
    description: "40% protein · 35% carbs · 25% fat",
    proteinPct: 40,
    carbsPct: 35,
    fatPct: 25,
  },
  keto: {
    label: "Keto",
    description: "20% protein · 5% carbs · 75% fat",
    proteinPct: 20,
    carbsPct: 5,
    fatPct: 75,
  },
  low_carb: {
    label: "Low Carb",
    description: "35% protein · 20% carbs · 45% fat",
    proteinPct: 35,
    carbsPct: 20,
    fatPct: 45,
  },
};

export function dietStyleLabel(style: DietStyle): string {
  if (style === "custom") return "Custom";
  return DIET_STYLES[style].label;
}

export function getMacroRatio(
  style: DietStyle,
  custom?: MacroRatio | null,
): MacroRatio {
  if (style === "custom" && custom) return custom;
  if (style === "custom") return DIET_STYLES.balanced;
  return DIET_STYLES[style];
}

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

export function lbsToKg(lbs: number): number {
  return lbs * 0.453592;
}

export function kgToLbs(kg: number): number {
  return kg / 0.453592;
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * 2.54;
}

export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, in: inch };
}

export type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

export function bmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) return 0;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return "underweight";
  if (value < 25) return "normal";
  if (value < 30) return "overweight";
  return "obese";
}

export function bmr(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
}): number {
  const { weightKg, heightCm, age, gender } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") return base + 5;
  if (gender === "female") return base - 161;
  return base - 78;
}

export function tdee(bmrValue: number, activity: ActivityLevel): number {
  return bmrValue * ACTIVITY_MULTIPLIERS[activity];
}

export function weeklyKgChange(
  currentKg: number,
  goalKg: number,
  weeks: number,
): number {
  if (weeks <= 0) return 0;
  return (currentKg - goalKg) / weeks;
}

export function dailyDeficit(weeklyKg: number): number {
  return (weeklyKg * 7700) / 7;
}

export function healthyTimelineRangeWeeks(
  currentKg: number,
  goalKg: number,
): { minWeeks: number; maxWeeks: number } | null {
  const delta = Math.abs(currentKg - goalKg);
  if (delta <= 0) return null;
  return {
    minWeeks: Math.max(1, Math.ceil(delta / 1)),
    maxWeeks: Math.max(1, Math.ceil(delta / 0.5)),
  };
}

export type MacroGoals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type AdjustedMacros = MacroGoals & {
  adjusted: boolean;
  insufficient: boolean;
};

export type MacroBreakdown = AdjustedMacros & {
  bmr: number;
  tdee: number;
};

const BUILD_MUSCLE_SURPLUS = 250;
const RECOMP_DEFICIT = 200;

export function minProteinGramsPerKg(composition: CompositionGoal): number {
  return composition === "recomp" ? 2.0 : 0.8;
}

export const MIN_FAT_PER_KG = 0.3;

export function caloriesForComposition(params: {
  tdee: number;
  composition: CompositionGoal;
  weeklyKg: number;
  gender: Gender;
  weightKg: number;
}): number {
  let calories: number;
  switch (params.composition) {
    case "maintain":
      calories = params.tdee;
      break;
    case "lose_fat":
      calories = params.tdee - dailyDeficit(params.weeklyKg);
      break;
    case "build_muscle":
      calories = params.tdee + BUILD_MUSCLE_SURPLUS;
      break;
    case "recomp":
      calories = params.tdee - RECOMP_DEFICIT;
      break;
  }
  const floor = calorieFloor(params.gender, params.weightKg);
  return Math.max(calories, floor);
}

export function macrosFromCaloriesAndRatio(
  calories: number,
  ratio: MacroRatio,
  weightKg: number,
  composition: CompositionGoal,
): AdjustedMacros {
  const cal = Math.max(Math.round(calories), 0);
  let protein = Math.round((cal * ratio.proteinPct) / 100 / 4);
  let fat = Math.round((cal * ratio.fatPct) / 100 / 9);
  let carbs = Math.round((cal * ratio.carbsPct) / 100 / 4);

  const minProtein = Math.round(minProteinGramsPerKg(composition) * weightKg);
  const minFat = Math.round(MIN_FAT_PER_KG * weightKg);

  let adjusted = false;
  if (protein < minProtein) {
    protein = minProtein;
    adjusted = true;
  }
  if (fat < minFat) {
    fat = minFat;
    adjusted = true;
  }

  let insufficient = false;
  if (adjusted) {
    const remaining = cal - protein * 4 - fat * 9;
    carbs = Math.round(remaining / 4);
    if (carbs < 0) {
      carbs = 0;
      insufficient = true;
    }
  } else {
    carbs = Math.max(carbs, 0);
  }

  return {
    calories: cal,
    protein,
    carbs,
    fat,
    adjusted,
    insufficient,
  };
}

export function computeMacros(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  activity: ActivityLevel;
  composition: CompositionGoal;
  weeklyKg: number;
  dietStyle: DietStyle;
  customRatio?: MacroRatio | null;
}): MacroBreakdown {
  const bmrValue = bmr(params);
  const tdeeValue = tdee(bmrValue, params.activity);
  const calories = caloriesForComposition({
    tdee: tdeeValue,
    composition: params.composition,
    weeklyKg: params.weeklyKg,
    gender: params.gender,
    weightKg: params.weightKg,
  });
  const ratio = getMacroRatio(params.dietStyle, params.customRatio);
  const macros = macrosFromCaloriesAndRatio(
    calories,
    ratio,
    params.weightKg,
    params.composition,
  );
  return {
    ...macros,
    bmr: Math.round(bmrValue),
    tdee: Math.round(tdeeValue),
  };
}

export function rebalanceFromCalories(
  calories: number,
  ratio: MacroRatio,
  weightKg: number,
  composition: CompositionGoal,
): AdjustedMacros {
  return macrosFromCaloriesAndRatio(calories, ratio, weightKg, composition);
}

export function allowedCompositions(
  currentKg: number,
  goalKg: number,
): CompositionGoal[] {
  if (currentKg <= 0 || goalKg <= 0) {
    return ["lose_fat", "build_muscle", "maintain", "recomp"];
  }
  const delta = currentKg - goalKg;
  if (delta > 5) return ["lose_fat"];
  if (delta > 2) return ["lose_fat", "recomp"];
  if (delta >= -2) return ["maintain", "recomp"];
  return ["build_muscle"];
}

export function allowedDietStyles(
  composition: CompositionGoal | null,
): DietStyle[] {
  if (!composition) return ["balanced", "high_protein", "keto", "low_carb", "custom"];
  if (composition === "build_muscle")
    return ["balanced", "high_protein", "custom"];
  if (composition === "recomp") return ["high_protein", "custom"];
  return ["balanced", "high_protein", "keto", "low_carb", "custom"];
}

export function rebalanceMacro(
  current: MacroGoals,
  edited: "protein" | "carbs" | "fat",
  newValue: number,
  ratio: MacroRatio,
): MacroGoals {
  const calories = current.calories;
  let protein = current.protein;
  let carbs = current.carbs;
  let fat = current.fat;

  if (edited === "protein") {
    protein = newValue;
    const remainingKcal = Math.max(calories - protein * 4, 0);
    const cfTotal = ratio.carbsPct + ratio.fatPct;
    const carbShare = cfTotal > 0 ? ratio.carbsPct / cfTotal : 0.5;
    carbs = (remainingKcal * carbShare) / 4;
    fat = (remainingKcal * (1 - carbShare)) / 9;
  } else if (edited === "carbs") {
    carbs = newValue;
    const remainingKcal = Math.max(calories - carbs * 4, 0);
    const pfTotal = ratio.proteinPct + ratio.fatPct;
    const proteinShare = pfTotal > 0 ? ratio.proteinPct / pfTotal : 0.5;
    protein = (remainingKcal * proteinShare) / 4;
    fat = (remainingKcal * (1 - proteinShare)) / 9;
  } else {
    fat = newValue;
    const remainingKcal = Math.max(calories - fat * 9, 0);
    const pcTotal = ratio.proteinPct + ratio.carbsPct;
    const proteinShare = pcTotal > 0 ? ratio.proteinPct / pcTotal : 0.5;
    protein = (remainingKcal * proteinShare) / 4;
    carbs = (remainingKcal * (1 - proteinShare)) / 4;
  }

  return {
    calories: Math.round(calories),
    protein: Math.round(Math.max(protein, 0)),
    carbs: Math.round(Math.max(carbs, 0)),
    fat: Math.round(Math.max(fat, 0)),
  };
}

export function timeframeFromCalories(
  tdeeValue: number,
  calories: number,
  currentKg: number,
  goalKg: number,
): number | null {
  const delta = currentKg - goalKg;
  if (delta === 0) return null;
  const dailyDef = tdeeValue - calories;
  const weeklyKg = (dailyDef * 7) / 7700;
  if (weeklyKg === 0) return null;
  if (weeklyKg * delta <= 0) return null;
  return Math.max(1, Math.round(Math.abs(delta) / Math.abs(weeklyKg)));
}

export function calorieFloor(gender: Gender, weightKg: number): number {
  const lbs = kgToLbs(weightKg);
  if (gender === "female") {
    const extra = Math.max(0, lbs - 130);
    return Math.round(1200 + extra);
  }
  if (gender === "male") {
    const extra = Math.max(0, lbs - 150);
    return Math.round(1500 + extra);
  }
  const extra = Math.max(0, lbs - 140);
  return Math.round(1350 + extra);
}

export function minimumMacros(
  weightKg: number,
  minCalories: number,
): MacroGoals {
  const protein = Math.round(0.8 * weightKg);
  const fat = Math.round(0.3 * weightKg);
  const remainingKcal = Math.max(minCalories - protein * 4 - fat * 9, 0);
  const carbs = Math.round(remainingKcal / 4);
  return { calories: Math.round(minCalories), protein, carbs, fat };
}

export function maxWeeklyLossKg(
  tdeeValue: number,
  minCalories: number,
): number {
  const maxDailyDeficit = Math.max(tdeeValue - minCalories, 0);
  return (maxDailyDeficit * 7) / 7700;
}

export function idealWeightRangeKg(
  heightCm: number,
): { minKg: number; maxKg: number } {
  if (heightCm <= 0) return { minKg: 0, maxKg: 0 };
  const m = heightCm / 100;
  return {
    minKg: 18.5 * m * m,
    maxKg: 24.9 * m * m,
  };
}

export function requiredCaloriesForRate(
  tdeeValue: number,
  weeklyKg: number,
): number {
  return tdeeValue - dailyDeficit(weeklyKg);
}
