import type {
  ActivityLevel,
  CompositionGoal,
  Gender,
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
  name: string | null;
  age: number | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
  timeframe_weeks: number | null;
  activity_level: ActivityLevel | null;
  composition_goal: CompositionGoal | null;
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
  const existing = await getUser();
  if (existing) {
    await db.runAsync(
      `UPDATE users SET
         name = ?, age = ?, gender = ?,
         height_cm = ?, weight_kg = ?, goal_weight_kg = ?, timeframe_weeks = ?,
         activity_level = ?, composition_goal = ?,
         daily_calorie_goal = ?, daily_protein_goal = ?, daily_carbs_goal = ?, daily_fat_goal = ?,
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
      existing.id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO users
         (name, age, gender, height_cm, weight_kg, goal_weight_kg, timeframe_weeks,
          activity_level, composition_goal,
          daily_calorie_goal, daily_protein_goal, daily_carbs_goal, daily_fat_goal,
          water_unit, water_goal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'glasses', 8)`,
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
    );
  }
  const saved = await getUser();
  if (!saved) throw new Error("Failed to persist onboarding profile");
  return saved;
}

export async function updateWaterSettings(
  water_unit: WaterUnit,
  water_goal: number,
): Promise<void> {
  const db = await getDatabase();
  const existing = await getUser();
  if (!existing) throw new Error("User not initialized");
  await db.runAsync(
    `UPDATE users SET water_unit = ?, water_goal = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    water_unit,
    water_goal,
    existing.id,
  );
}
