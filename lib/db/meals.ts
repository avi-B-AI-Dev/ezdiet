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

export type MealSource = "homemade" | "restaurant";

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
  name: string | null;
  meal_source: MealSource | null;
  restaurant_name: string | null;
  from_leftover_dish_id: number | null;
  from_leftover_servings: number | null;
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

export type MealInput = Omit<
  Meal,
  | "id"
  | "logged_at"
  | "name"
  | "meal_source"
  | "restaurant_name"
  | "from_leftover_dish_id"
  | "from_leftover_servings"
> & {
  logged_at?: string;
  name?: string | null;
  meal_source?: MealSource | null;
  restaurant_name?: string | null;
  from_leftover_dish_id?: number | null;
  from_leftover_servings?: number | null;
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
         (meal_type, input_type, description, total_calories, total_protein, total_carbs, total_fat, servings, logged_at, name, meal_source, restaurant_name, from_leftover_dish_id, from_leftover_servings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?, ?)`,
      meal.meal_type,
      meal.input_type,
      meal.description,
      meal.total_calories,
      meal.total_protein,
      meal.total_carbs,
      meal.total_fat,
      meal.servings,
      meal.logged_at ?? null,
      meal.name ?? null,
      meal.meal_source ?? null,
      meal.restaurant_name ?? null,
      meal.from_leftover_dish_id ?? null,
      meal.from_leftover_servings ?? null,
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

export async function listRecentMeals(limit: number): Promise<Meal[]> {
  const db = await getDatabase();
  return db.getAllAsync<Meal>(
    "SELECT * FROM meals ORDER BY logged_at DESC LIMIT ?",
    limit,
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
  await db.withTransactionAsync(async () => {
    // 1) If this meal was a leftover re-log, push its consumed servings back
    //    onto the linked dish (capped at servings_made).
    const meal = await db.getFirstAsync<{
      from_leftover_dish_id: number | null;
      from_leftover_servings: number | null;
    }>(
      "SELECT from_leftover_dish_id, from_leftover_servings FROM meals WHERE id = ?",
      id,
    );
    if (
      meal?.from_leftover_dish_id != null &&
      meal.from_leftover_servings != null &&
      meal.from_leftover_servings > 0
    ) {
      await db.runAsync(
        `UPDATE dishes
           SET servings_remaining = MIN(servings_remaining + ?, servings_made),
               servings_eaten = MAX(servings_eaten - ?, 0)
         WHERE id = ?`,
        meal.from_leftover_servings,
        meal.from_leftover_servings,
        meal.from_leftover_dish_id,
      );
    }

    // 2) For dishes owned by this meal, detach any that other re-log meals
    //    still reference — that preserves their leftover info instead of
    //    cascading away with this meal.
    const ownedDishes = await db.getAllAsync<{ id: number }>(
      "SELECT id FROM dishes WHERE meal_id = ?",
      id,
    );
    for (const d of ownedDishes) {
      const others = await db.getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) AS c FROM meals WHERE from_leftover_dish_id = ? AND id != ?",
        d.id,
        id,
      );
      if ((others?.c ?? 0) > 0) {
        await db.runAsync(
          "UPDATE dishes SET meal_id = NULL WHERE id = ?",
          d.id,
        );
      }
    }

    await db.runAsync("DELETE FROM meals WHERE id = ?", id);
  });
}
