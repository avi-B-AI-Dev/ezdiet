import {
  calorieFloor,
  type ActivityLevel,
  type CompositionGoal,
  type DietStyle,
  type Gender,
} from "@/lib/nutrition";

import { getDatabase } from "./client";

export type WaterUnit = "glasses" | "oz" | "liters";

export type User = {
  id: number;
  daily_calorie_goal: number;
  daily_protein_goal: number;
  daily_carbs_goal: number;
  daily_fat_goal: number;
  water_unit: WaterUnit;
  water_goal: number;
  water_goal_ml: number | null;
  name: string | null;
  age: number | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
  timeframe_weeks: number | null;
  activity_level: ActivityLevel | null;
  composition_goal: CompositionGoal | null;
  diet_style: DietStyle | null;
  protein_pct: number | null;
  carbs_pct: number | null;
  fat_pct: number | null;
  household_code: string | null;
  min_calories: number | null;
  created_at: string;
  updated_at: string;
};

export type UserGoalsInput = {
  daily_calorie_goal: number;
  daily_protein_goal: number;
  daily_carbs_goal: number;
  daily_fat_goal: number;
  water_unit?: WaterUnit;
  water_goal?: number;
};

export type OnboardingProfile = {
  name: string;
  age: number;
  gender: Gender;
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number;
  timeframe_weeks: number;
  activity_level: ActivityLevel;
  composition_goal: CompositionGoal;
  daily_calorie_goal: number;
  daily_protein_goal: number;
  daily_carbs_goal: number;
  daily_fat_goal: number;
  diet_style?: DietStyle | null;
  protein_pct?: number | null;
  carbs_pct?: number | null;
  fat_pct?: number | null;
  household_code?: string | null;
};

export async function getUser(): Promise<User | null> {
  const db = await getDatabase();
  return db.getFirstAsync<User>("SELECT * FROM users ORDER BY id LIMIT 1");
}

export async function saveUserGoals(goals: UserGoalsInput): Promise<User> {
  const db = await getDatabase();
  const existing = await getUser();
  if (existing) {
    await db.runAsync(
      `UPDATE users SET
         daily_calorie_goal = ?,
         daily_protein_goal = ?,
         daily_carbs_goal = ?,
         daily_fat_goal = ?,
         water_unit = COALESCE(?, water_unit),
         water_goal = COALESCE(?, water_goal),
         updated_at = datetime('now','localtime')
       WHERE id = ?`,
      goals.daily_calorie_goal,
      goals.daily_protein_goal,
      goals.daily_carbs_goal,
      goals.daily_fat_goal,
      goals.water_unit ?? null,
      goals.water_goal ?? null,
      existing.id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO users
         (daily_calorie_goal, daily_protein_goal, daily_carbs_goal, daily_fat_goal, water_unit, water_goal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      goals.daily_calorie_goal,
      goals.daily_protein_goal,
      goals.daily_carbs_goal,
      goals.daily_fat_goal,
      goals.water_unit ?? "glasses",
      goals.water_goal ?? 8,
    );
  }
  const saved = await getUser();
  if (!saved) throw new Error("Failed to persist user goals");
  return saved;
}

export async function saveOnboardingProfile(
  p: OnboardingProfile,
): Promise<User> {
  const db = await getDatabase();
  const minCalories = calorieFloor(p.gender, p.weight_kg);
  const existing = await getUser();
  if (existing) {
    await db.runAsync(
      `UPDATE users SET
         name = ?, age = ?, gender = ?,
         height_cm = ?, weight_kg = ?, goal_weight_kg = ?, timeframe_weeks = ?,
         activity_level = ?, composition_goal = ?,
         daily_calorie_goal = ?, daily_protein_goal = ?, daily_carbs_goal = ?, daily_fat_goal = ?,
         diet_style = COALESCE(?, diet_style),
         protein_pct = COALESCE(?, protein_pct),
         carbs_pct = COALESCE(?, carbs_pct),
         fat_pct = COALESCE(?, fat_pct),
         household_code = COALESCE(?, household_code),
         min_calories = ?,
         updated_at = datetime('now','localtime')
       WHERE id = ?`,
      p.name,
      p.age,
      p.gender,
      p.height_cm,
      p.weight_kg,
      p.goal_weight_kg,
      p.timeframe_weeks,
      p.activity_level,
      p.composition_goal,
      p.daily_calorie_goal,
      p.daily_protein_goal,
      p.daily_carbs_goal,
      p.daily_fat_goal,
      p.diet_style ?? null,
      p.protein_pct ?? null,
      p.carbs_pct ?? null,
      p.fat_pct ?? null,
      p.household_code ?? null,
      minCalories,
      existing.id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO users
         (name, age, gender, height_cm, weight_kg, goal_weight_kg, timeframe_weeks,
          activity_level, composition_goal,
          daily_calorie_goal, daily_protein_goal, daily_carbs_goal, daily_fat_goal,
          diet_style, protein_pct, carbs_pct, fat_pct, household_code,
          min_calories,
          water_unit, water_goal, water_goal_ml)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'glasses', 8, 1896)`,
      p.name,
      p.age,
      p.gender,
      p.height_cm,
      p.weight_kg,
      p.goal_weight_kg,
      p.timeframe_weeks,
      p.activity_level,
      p.composition_goal,
      p.daily_calorie_goal,
      p.daily_protein_goal,
      p.daily_carbs_goal,
      p.daily_fat_goal,
      p.diet_style ?? null,
      p.protein_pct ?? null,
      p.carbs_pct ?? null,
      p.fat_pct ?? null,
      p.household_code ?? null,
      minCalories,
    );
  }
  const saved = await getUser();
  if (!saved) throw new Error("Failed to persist onboarding profile");
  return saved;
}

const ML_PER_UNIT: Record<WaterUnit, number> = {
  glasses: 237,
  oz: 29.57,
  liters: 1000,
};

export async function updateWaterSettings(
  water_unit: WaterUnit,
  water_goal_ml: number,
): Promise<void> {
  const db = await getDatabase();
  const existing = await getUser();
  if (!existing) throw new Error("User not initialized");
  const legacyGoal = water_goal_ml / ML_PER_UNIT[water_unit];
  await db.runAsync(
    `UPDATE users SET water_unit = ?, water_goal_ml = ?, water_goal = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    water_unit,
    water_goal_ml,
    legacyGoal,
    existing.id,
  );
}
