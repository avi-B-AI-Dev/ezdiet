import { getDatabase } from "./client";

export type NutritionCacheRow = {
  id: number;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  assumed_weight_g: number | null;
  confidence: number;
  source: string;
  cached_at: string;
};

const STALE_DAYS = 30;

export async function findCachedNutrition(
  name: string,
): Promise<NutritionCacheRow | null> {
  const db = await getDatabase();
  const normalized = name.trim().toLowerCase();
  const row = await db.getFirstAsync<NutritionCacheRow>(
    `SELECT * FROM nutrition_cache
     WHERE lower(ingredient_name) = ?
       AND julianday('now') - julianday(cached_at) <= ?
     ORDER BY cached_at DESC
     LIMIT 1`,
    normalized,
    STALE_DAYS,
  );
  return row ?? null;
}

export async function saveCachedNutrition(row: {
  ingredient_name: string;
  quantity?: number | null;
  unit?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  assumed_weight_g?: number | null;
  confidence: number;
  source: string;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO nutrition_cache
       (ingredient_name, quantity, unit, calories, protein, carbs, fat, fiber, assumed_weight_g, confidence, source, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    row.ingredient_name.trim().toLowerCase(),
    row.quantity ?? null,
    row.unit ?? null,
    row.calories,
    row.protein,
    row.carbs,
    row.fat,
    row.fiber ?? null,
    row.assumed_weight_g ?? null,
    row.confidence,
    row.source,
  );
}
