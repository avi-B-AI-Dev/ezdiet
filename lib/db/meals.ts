import { getDatabase } from "./client";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type MealInputType =
  | "home_cooked"
  | "packaged"
  | "frozen_instant"
  | "chain_restaurant"
  | "local_restaurant"
  | "drink"
  | "fruit_raw"
  | "combination";

export type Meal = {
  id: number;
  meal_type: MealType;
  input_type: MealInputType;
  description: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  servings: number;
  logged_at: string;
};

export type MealIngredient = {
  id: number;
  meal_id: number;
  pantry_item_id: number | null;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealInput = Omit<Meal, "id" | "logged_at"> & {
  logged_at?: string;
};

export type MealIngredientInput = Omit<MealIngredient, "id" | "meal_id">;

export async function createMeal(
  meal: MealInput,
  ingredients: MealIngredientInput[],
): Promise<number> {
  const db = await getDatabase();
  let mealId = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO meals
         (meal_type, input_type, description, total_calories, total_protein, total_carbs, total_fat, servings, logged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`,
      meal.meal_type,
      meal.input_type,
      meal.description,
      meal.total_calories,
      meal.total_protein,
      meal.total_carbs,
      meal.total_fat,
      meal.servings,
      meal.logged_at ?? null,
    );
    mealId = res.lastInsertRowId;
    for (const ing of ingredients) {
      await db.runAsync(
        `INSERT INTO meal_ingredients
           (meal_id, pantry_item_id, name, quantity, unit, calories, protein, carbs, fat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        mealId,
        ing.pantry_item_id,
        ing.name,
        ing.quantity,
        ing.unit,
        ing.calories,
        ing.protein,
        ing.carbs,
        ing.fat,
      );
    }
  });
  return mealId;
}

export async function getMeal(id: number): Promise<Meal | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Meal>("SELECT * FROM meals WHERE id = ?", id);
}

export async function getMealIngredients(
  mealId: number,
): Promise<MealIngredient[]> {
  const db = await getDatabase();
  return db.getAllAsync<MealIngredient>(
    "SELECT * FROM meal_ingredients WHERE meal_id = ? ORDER BY id",
    mealId,
  );
}

export async function listMealsByDate(dateISO: string): Promise<Meal[]> {
  const db = await getDatabase();
  return db.getAllAsync<Meal>(
    "SELECT * FROM meals WHERE date(logged_at) = date(?) ORDER BY logged_at",
    dateISO,
  );
}

export async function listMealsBetween(
  startISO: string,
  endISO: string,
): Promise<Meal[]> {
  const db = await getDatabase();
  return db.getAllAsync<Meal>(
    "SELECT * FROM meals WHERE logged_at >= ? AND logged_at <= ? ORDER BY logged_at",
    startISO,
    endISO,
  );
}

export async function deleteMeal(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM meals WHERE id = ?", id);
}
