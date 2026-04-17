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

export type MacroBreakdown = MacroGoals & {
  bmr: number;
  tdee: number;
};

export function computeMacros(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  activity: ActivityLevel;
  composition: CompositionGoal;
  weeklyKg: number;
}): MacroBreakdown {
  const bmrValue = bmr(params);
  const tdeeValue = tdee(bmrValue, params.activity);

  let calories: number;
  if (params.composition === "maintain") {
    calories = tdeeValue;
  } else {
    calories = tdeeValue - dailyDeficit(params.weeklyKg);
  }

  const floor = params.gender === "female" ? 1200 : 1500;
  calories = Math.max(calories, floor);

  let proteinPerKg = 1.8;
  if (params.composition === "lose_fat") proteinPerKg = 1.6;
  else if (params.composition === "build_muscle") proteinPerKg = 2.2;

  const protein = params.weightKg * proteinPerKg;
  const fat = (calories * 0.25) / 9;
  const carbs = Math.max((calories - protein * 4 - fat * 9) / 4, 0);

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    fat: Math.round(fat),
    carbs: Math.round(carbs),
    bmr: Math.round(bmrValue),
    tdee: Math.round(tdeeValue),
  };
}
