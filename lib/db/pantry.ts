import { getDatabase } from "./client";

export type PantrySource =
  | "scanned"
  | "manual"
  | "api_lookup"
  | "ai_estimated";

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
  micronutrients: string | null;
  photo_uri: string | null;
  source: PantrySource;
  created_at: string;
  updated_at: string;
};

export type PantryItemInput = Omit<
  PantryItem,
  "id" | "created_at" | "updated_at"
>;

export async function createPantryItem(item: PantryItemInput): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO pantry_items
       (name, brand, barcode, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
        fiber_per_100g, serving_size, serving_unit, micronutrients, photo_uri, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    item.micronutrients,
    item.photo_uri,
    item.source,
  );
  return res.lastInsertRowId;
}

export async function upsertPantryItem(item: PantryItemInput): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO pantry_items
       (name, brand, barcode, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
        fiber_per_100g, serving_size, serving_unit, micronutrients, photo_uri, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name, brand) DO UPDATE SET
       barcode = excluded.barcode,
       calories_per_100g = excluded.calories_per_100g,
       protein_per_100g = excluded.protein_per_100g,
       carbs_per_100g = excluded.carbs_per_100g,
       fat_per_100g = excluded.fat_per_100g,
       fiber_per_100g = excluded.fiber_per_100g,
       serving_size = excluded.serving_size,
       serving_unit = excluded.serving_unit,
       micronutrients = excluded.micronutrients,
       photo_uri = excluded.photo_uri,
       source = excluded.source,
       updated_at = datetime('now')`,
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
    item.micronutrients,
    item.photo_uri,
    item.source,
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
       micronutrients = ?, photo_uri = ?, source = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
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
    item.micronutrients,
    item.photo_uri,
    item.source,
    id,
  );
}

export async function deletePantryItem(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM pantry_items WHERE id = ?", id);
}
