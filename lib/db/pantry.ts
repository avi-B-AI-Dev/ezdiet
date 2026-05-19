import type { SQLiteBindValue } from "expo-sqlite";

import { getDatabase } from "./client";

export type PantrySource =
  | "label_verified"
  | "api_lookup"
  | "ai_estimated"
  | "common_db"
  | "scanned" // legacy
  | "manual"; // legacy

export type PantryCategory =
  | "grain"
  | "protein"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "oil"
  | "spice"
  | "packaged"
  | "other";

export type PantryItem = {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  serving_size: number;
  serving_unit: string;
  servings_per_package: number | null;
  total_package_size: number | null;
  total_package_unit: string | null;
  category: PantryCategory | null;
  micronutrients: string | null;
  photo_uri: string | null;
  source: PantrySource;
  confidence_score: number | null;
  quantity_purchased: number | null;
  quantity_remaining: number | null;
  created_at: string;
  updated_at: string;
};

export type PantryItemInput = Omit<
  PantryItem,
  "id" | "created_at" | "updated_at"
>;

const ALL_FIELDS = `name, brand, barcode,
  calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g,
  serving_size, serving_unit, servings_per_package, total_package_size, total_package_unit,
  category, micronutrients, photo_uri, source, confidence_score,
  quantity_purchased, quantity_remaining`;

const ALL_PLACEHOLDERS = "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?";

function bindAll(item: PantryItemInput): SQLiteBindValue[] {
  return [
    item.name,
    item.brand,
    item.barcode,
    item.calories_per_100g,
    item.protein_per_100g,
    item.carbs_per_100g,
    item.fat_per_100g,
    item.fiber_per_100g,
    item.serving_size,
    item.serving_unit,
    item.servings_per_package,
    item.total_package_size,
    item.total_package_unit,
    item.category,
    item.micronutrients,
    item.photo_uri,
    item.source,
    item.confidence_score,
    item.quantity_purchased,
    item.quantity_remaining,
  ];
}

export async function createPantryItem(item: PantryItemInput): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO pantry_items (${ALL_FIELDS}) VALUES (${ALL_PLACEHOLDERS})`,
    ...bindAll(item),
  );
  return res.lastInsertRowId;
}

export async function upsertPantryItem(item: PantryItemInput): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO pantry_items (${ALL_FIELDS}) VALUES (${ALL_PLACEHOLDERS})
     ON CONFLICT(name, brand) DO UPDATE SET
       barcode = excluded.barcode,
       calories_per_100g = excluded.calories_per_100g,
       protein_per_100g = excluded.protein_per_100g,
       carbs_per_100g = excluded.carbs_per_100g,
       fat_per_100g = excluded.fat_per_100g,
       fiber_per_100g = excluded.fiber_per_100g,
       serving_size = excluded.serving_size,
       serving_unit = excluded.serving_unit,
       servings_per_package = excluded.servings_per_package,
       total_package_size = excluded.total_package_size,
       total_package_unit = excluded.total_package_unit,
       category = excluded.category,
       micronutrients = excluded.micronutrients,
       photo_uri = excluded.photo_uri,
       source = excluded.source,
       confidence_score = excluded.confidence_score,
       quantity_purchased = excluded.quantity_purchased,
       quantity_remaining = excluded.quantity_remaining,
       updated_at = datetime('now','localtime')`,
    ...bindAll(item),
  );
  if (res.lastInsertRowId) return res.lastInsertRowId;
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM pantry_items WHERE name = ? AND brand IS ?`,
    item.name,
    item.brand,
  );
  if (!existing) throw new Error("upsertPantryItem: could not resolve row id");
  return existing.id;
}

export async function getPantryItem(id: number): Promise<PantryItem | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PantryItem>(
    "SELECT * FROM pantry_items WHERE id = ?",
    id,
  );
}

export async function findPantryItemByBarcode(
  barcode: string,
): Promise<PantryItem | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PantryItem>(
    "SELECT * FROM pantry_items WHERE barcode = ? LIMIT 1",
    barcode,
  );
}

export async function findPantryItemByNameBrand(
  name: string,
  brand: string | null,
): Promise<PantryItem | null> {
  const db = await getDatabase();
  return db.getFirstAsync<PantryItem>(
    "SELECT * FROM pantry_items WHERE lower(name) = lower(?) AND IFNULL(brand,'') = IFNULL(?, '') LIMIT 1",
    name,
    brand,
  );
}

export async function listPantryItems(): Promise<PantryItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<PantryItem>(
    "SELECT * FROM pantry_items ORDER BY name COLLATE NOCASE",
  );
}

export async function searchPantryItems(query: string): Promise<PantryItem[]> {
  const db = await getDatabase();
  const q = `%${query}%`;
  return db.getAllAsync<PantryItem>(
    "SELECT * FROM pantry_items WHERE name LIKE ? OR brand LIKE ? ORDER BY name COLLATE NOCASE",
    q,
    q,
  );
}

export async function updatePantryItem(
  id: number,
  item: PantryItemInput,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE pantry_items SET
       name = ?, brand = ?, barcode = ?,
       calories_per_100g = ?, protein_per_100g = ?, carbs_per_100g = ?, fat_per_100g = ?,
       fiber_per_100g = ?, serving_size = ?, serving_unit = ?,
       servings_per_package = ?, total_package_size = ?, total_package_unit = ?,
       category = ?, micronutrients = ?, photo_uri = ?, source = ?, confidence_score = ?,
       quantity_purchased = ?, quantity_remaining = ?,
       updated_at = datetime('now','localtime')
     WHERE id = ?`,
    ...bindAll(item),
    id,
  );
}

export async function deletePantryItem(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM pantry_items WHERE id = ?", id);
}

export async function getPantryItemCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM pantry_items",
  );
  return row?.c ?? 0;
}

// Hard-delete every pantry row. The FK from meal_ingredients/recipe_ingredients
// is `ON DELETE SET NULL`, so meal history and nutrition snapshots survive —
// only the link back to the pantry row is dropped. The nutrition_cache table
// is unrelated and not touched.
export async function clearAllPantryItems(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM pantry_items");
}

// Render the per-serving line as `1 medium (50g)` / `1 cup (244ml)`.
// Picks ml for volume-style units (cup/tsp/tbsp/ml/l), g otherwise. If the
// unit text already encodes the same weight/volume (e.g. `100g`), skips the
// duplicated parenthetical.
export function formatServingDisplay(item: {
  serving_size: number;
  serving_unit: string;
  category?: PantryCategory | null;
}): string {
  const unitText = (item.serving_unit ?? "").trim();
  const VOL_HINTS = /(cup|cups|tablespoon|tbsp|teaspoon|tsp|ml|millili|liter|litre|^l$|gallon)/i;
  const isLiquidCategory =
    item.category === "dairy" || item.category === "oil";
  const useMl = VOL_HINTS.test(unitText) || isLiquidCategory;
  const weightUnit = useMl ? "ml" : "g";
  const size = Math.round(item.serving_size);
  // If unit already starts with a number (e.g. "1 cup", "100g"), use as-is.
  const looksLikeFullUnit = /^\s*\d/.test(unitText) || unitText === "";
  const displayUnit = looksLikeFullUnit
    ? unitText || `${size}${weightUnit}`
    : `1 ${unitText}`;
  // Skip the parenthetical when the unit text already encodes the weight.
  const leadingNum = unitText.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/i);
  if (
    leadingNum &&
    Math.abs(parseFloat(leadingNum[1]) - size) < 0.5 &&
    leadingNum[2].toLowerCase() === weightUnit
  ) {
    return displayUnit;
  }
  return `${displayUnit} (${size}${weightUnit})`;
}

// Estimate "remaining" units by subtracting consumed grams from purchased
// grams. Returns null if we can't compute a sensible figure.
export function estimateRemainingDisplay(item: PantryItem): {
  text: string;
  fraction: number; // 0..1
  isLow: boolean;
} | null {
  if (item.quantity_remaining == null || item.quantity_purchased == null) {
    return null;
  }
  const fraction =
    item.quantity_purchased > 0
      ? Math.max(0, item.quantity_remaining) / item.quantity_purchased
      : 0;
  const isLow = fraction > 0 && fraction < 0.2;
  const remaining = Math.max(0, item.quantity_remaining);
  // Whole-unit categories show "~N left", weight-based categories show "~Ng"
  const weightUnits = new Set(["g", "kg", "ml", "l"]);
  const unit = (item.total_package_unit ?? item.serving_unit ?? "").toLowerCase();
  if (weightUnits.has(unit)) {
    const display = unit === "kg" || unit === "l"
      ? `${remaining.toFixed(2)}${unit}`
      : `${Math.round(remaining)}${unit}`;
    return { text: `~${display} left`, fraction, isLow };
  }
  return {
    text: `~${remaining % 1 === 0 ? remaining : remaining.toFixed(1)} left`,
    fraction,
    isLow,
  };
}

// Decrement an item's remaining quantity by `gramsConsumed`. The item's
// total_package_unit dictates whether we treat the remaining count as units
// or grams. For unit-based items (eggs, pieces), divide grams by serving_size
// to figure out how many units were consumed.
export async function consumeFromPantry(
  pantryItemId: number,
  gramsConsumed: number,
): Promise<void> {
  const db = await getDatabase();
  const item = await getPantryItem(pantryItemId);
  if (!item || item.quantity_remaining == null) return;
  const unit = (item.total_package_unit ?? item.serving_unit ?? "").toLowerCase();
  const weightUnits = new Set(["g", "kg", "ml", "l"]);
  let consumed: number;
  if (weightUnits.has(unit)) {
    consumed =
      unit === "kg" || unit === "l" ? gramsConsumed / 1000 : gramsConsumed;
  } else {
    const perUnit = item.serving_size > 0 ? item.serving_size : 1;
    consumed = gramsConsumed / perUnit;
  }
  await db.runAsync(
    "UPDATE pantry_items SET quantity_remaining = MAX(quantity_remaining - ?, 0), updated_at = datetime('now','localtime') WHERE id = ?",
    consumed,
    pantryItemId,
  );
}

// Best-effort fuzzy match against pantry by ingredient name. Used by the
// nutrition pipeline to attribute consumption back to a pantry row when the
// user logs a meal.
export async function findPantryItemByFuzzyName(
  name: string,
): Promise<PantryItem | null> {
  const db = await getDatabase();
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const exact = await db.getFirstAsync<PantryItem>(
    "SELECT * FROM pantry_items WHERE lower(name) = ? LIMIT 1",
    normalized,
  );
  if (exact) return exact;
  return db.getFirstAsync<PantryItem>(
    "SELECT * FROM pantry_items WHERE lower(name) LIKE ? ORDER BY length(name) ASC LIMIT 1",
    `%${normalized}%`,
  );
}
