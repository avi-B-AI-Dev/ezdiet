import { getDatabase } from "./client";

export type Dish = {
  id: number;
  meal_id: number | null;
  name: string | null;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  servings_made: number;
  servings_eaten: number;
  servings_remaining: number;
  is_recipe: number;
  recipe_name: string | null;
  created_at: string;
};

export type DishIngredientRow = {
  id: number;
  meal_id: number;
  dish_id: number | null;
  pantry_item_id: number | null;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number | null;
  source: string | null;
  assumed_weight_g: number | null;
  cooking_state: "raw" | "cooked" | "irrelevant" | null;
};

export type DishInput = {
  meal_id: number;
  name: string | null;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  servings_made: number;
  servings_eaten: number;
  is_recipe?: boolean;
  recipe_name?: string | null;
};

export type DishIngredientInput = {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  source: string;
  assumed_weight_g?: number | null;
  pantry_item_id?: number | null;
  cooking_state?: "raw" | "cooked" | "irrelevant" | null;
};

export async function createDish(
  dish: DishInput,
  ingredients: DishIngredientInput[],
): Promise<number> {
  const db = await getDatabase();
  let dishId = 0;
  const remaining = Math.max(dish.servings_made - dish.servings_eaten, 0);
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO dishes
         (meal_id, name, total_calories, total_protein, total_carbs, total_fat,
          servings_made, servings_eaten, servings_remaining, is_recipe, recipe_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
      dish.meal_id,
      dish.name,
      dish.total_calories,
      dish.total_protein,
      dish.total_carbs,
      dish.total_fat,
      dish.servings_made,
      dish.servings_eaten,
      remaining,
      dish.is_recipe ? 1 : 0,
      dish.recipe_name ?? null,
    );
    dishId = res.lastInsertRowId;
    for (const ing of ingredients) {
      await db.runAsync(
        `INSERT INTO meal_ingredients
           (meal_id, dish_id, pantry_item_id, name, quantity, unit, calories, protein, carbs, fat, confidence, source, assumed_weight_g, cooking_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        dish.meal_id,
        dishId,
        ing.pantry_item_id ?? null,
        ing.name,
        ing.quantity,
        ing.unit,
        ing.calories,
        ing.protein,
        ing.carbs,
        ing.fat,
        ing.confidence,
        ing.source,
        ing.assumed_weight_g ?? null,
        ing.cooking_state ?? null,
      );
    }
  });
  return dishId;
}

export async function listDishesForMeal(mealId: number): Promise<Dish[]> {
  const db = await getDatabase();
  return db.getAllAsync<Dish>(
    "SELECT * FROM dishes WHERE meal_id = ? ORDER BY id",
    mealId,
  );
}

export async function listDishIngredients(
  dishId: number,
): Promise<DishIngredientRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<DishIngredientRow>(
    "SELECT * FROM meal_ingredients WHERE dish_id = ? ORDER BY id",
    dishId,
  );
}

export async function deleteDishesForMeal(mealId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM dishes WHERE meal_id = ?", mealId);
}

export type LeftoverDish = Dish & { meal_logged_at: string };

export async function listActiveLeftovers(): Promise<LeftoverDish[]> {
  const db = await getDatabase();
  // Expire leftovers older than 7 days (zero them out)
  await db.runAsync(
    `UPDATE dishes SET servings_remaining = 0
     WHERE servings_remaining > 0
       AND julianday('now') - julianday(created_at) > 7`,
  );
  return db.getAllAsync<LeftoverDish>(
    `SELECT d.*, COALESCE(m.logged_at, d.created_at) AS meal_logged_at
     FROM dishes d
     LEFT JOIN meals m ON m.id = d.meal_id
     WHERE d.servings_remaining > 0
     ORDER BY d.created_at DESC`,
  );
}

export async function consumeLeftover(
  dishId: number,
  servingsEaten: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE dishes
       SET servings_remaining = MAX(servings_remaining - ?, 0),
           servings_eaten = servings_eaten + ?
     WHERE id = ?`,
    servingsEaten,
    servingsEaten,
    dishId,
  );
}

export async function listRecentUniqueDishes(limit: number): Promise<Dish[]> {
  const db = await getDatabase();
  return db.getAllAsync<Dish>(
    `SELECT d.* FROM dishes d
     ORDER BY d.created_at DESC
     LIMIT ?`,
    limit,
  );
}

// Count meals (other than excludeMealId) that consume from this dish:
//   - The owner of the dish (dish.meal_id) if non-null and ≠ excludeMealId
//   - Any other re-log meals linking via from_leftover_dish_id
export async function countOtherDishConsumers(
  dishId: number,
  excludeMealId: number,
): Promise<number> {
  const db = await getDatabase();
  const dish = await db.getFirstAsync<{ meal_id: number | null }>(
    "SELECT meal_id FROM dishes WHERE id = ?",
    dishId,
  );
  let count = 0;
  if (dish?.meal_id != null && dish.meal_id !== excludeMealId) count += 1;
  const relogs = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM meals WHERE from_leftover_dish_id = ? AND id != ?",
    dishId,
    excludeMealId,
  );
  count += relogs?.c ?? 0;
  return count;
}

// "I still have them" — fully restore the prep as if no one ate any.
// Called BEFORE the meal is deleted; the second arg controls whether to
// detach the dish from this meal (so cascade-delete won't take it down).
export async function resetDishToFullLeftover(
  dishId: number,
  detachFromMeal: boolean,
): Promise<void> {
  const db = await getDatabase();
  if (detachFromMeal) {
    await db.runAsync(
      `UPDATE dishes
         SET meal_id = NULL,
             servings_eaten = 0,
             servings_remaining = servings_made
       WHERE id = ?`,
      dishId,
    );
  } else {
    await db.runAsync(
      `UPDATE dishes
         SET servings_eaten = 0,
             servings_remaining = servings_made
       WHERE id = ?`,
      dishId,
    );
  }
}

// "They're gone" — keep the dish history but mark zero leftover.
export async function clearDishLeftover(
  dishId: number,
  detachFromMeal: boolean,
): Promise<void> {
  const db = await getDatabase();
  if (detachFromMeal) {
    await db.runAsync(
      "UPDATE dishes SET meal_id = NULL, servings_remaining = 0 WHERE id = ?",
      dishId,
    );
  } else {
    await db.runAsync(
      "UPDATE dishes SET servings_remaining = 0 WHERE id = ?",
      dishId,
    );
  }
}

// "I never made this" — wipe the prep entirely.
export async function deleteDish(dishId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM dishes WHERE id = ?", dishId);
}

// Clear a meal's link to a leftover dish (used when a popup choice handles
// the dish manually and we don't want deleteMeal's auto-restore to re-add
// servings on top of the explicit reset).
export async function clearMealLeftoverLink(mealId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE meals SET from_leftover_dish_id = NULL, from_leftover_servings = NULL WHERE id = ?",
    mealId,
  );
}
