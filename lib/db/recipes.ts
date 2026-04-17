import { getDatabase } from "./client";

export type SavedRecipe = {
  id: number;
  name: string;
  description: string | null;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  default_servings: number;
  created_at: string;
};

export type RecipeIngredient = {
  id: number;
  recipe_id: number;
  pantry_item_id: number | null;
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type SavedRecipeInput = Omit<SavedRecipe, "id" | "created_at">;
export type RecipeIngredientInput = Omit<RecipeIngredient, "id" | "recipe_id">;

export async function createRecipe(
  recipe: SavedRecipeInput,
  ingredients: RecipeIngredientInput[],
): Promise<number> {
  const db = await getDatabase();
  let recipeId = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO saved_recipes
         (name, description, total_calories, total_protein, total_carbs, total_fat, default_servings)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      recipe.name,
      recipe.description,
      recipe.total_calories,
      recipe.total_protein,
      recipe.total_carbs,
      recipe.total_fat,
      recipe.default_servings,
    );
    recipeId = res.lastInsertRowId;
    for (const ing of ingredients) {
      await db.runAsync(
        `INSERT INTO recipe_ingredients
           (recipe_id, pantry_item_id, name, quantity, unit, calories, protein, carbs, fat)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        recipeId,
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
  return recipeId;
}

export async function getRecipe(id: number): Promise<SavedRecipe | null> {
  const db = await getDatabase();
  return db.getFirstAsync<SavedRecipe>(
    "SELECT * FROM saved_recipes WHERE id = ?",
    id,
  );
}

export async function getRecipeIngredients(
  recipeId: number,
): Promise<RecipeIngredient[]> {
  const db = await getDatabase();
  return db.getAllAsync<RecipeIngredient>(
    "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY id",
    recipeId,
  );
}

export async function listRecipes(): Promise<SavedRecipe[]> {
  const db = await getDatabase();
  return db.getAllAsync<SavedRecipe>(
    "SELECT * FROM saved_recipes ORDER BY name COLLATE NOCASE",
  );
}

export async function deleteRecipe(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM saved_recipes WHERE id = ?", id);
}
