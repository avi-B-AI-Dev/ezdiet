import { getDatabase } from "./client";

export type Supplement = {
  id: number;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients: string | null;
  created_at: string;
};

export type SupplementInput = Omit<Supplement, "id" | "created_at">;

export type SupplementLogEntry = {
  id: number;
  supplement_id: number;
  logged_at: string;
};

export async function createSupplement(s: SupplementInput): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO supplements (name, brand, calories, protein, carbs, fat, micronutrients)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    s.name,
    s.brand,
    s.calories,
    s.protein,
    s.carbs,
    s.fat,
    s.micronutrients,
  );
  return res.lastInsertRowId;
}

export async function getSupplement(id: number): Promise<Supplement | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Supplement>(
    "SELECT * FROM supplements WHERE id = ?",
    id,
  );
}

export async function listSupplements(): Promise<Supplement[]> {
  const db = await getDatabase();
  return db.getAllAsync<Supplement>(
    "SELECT * FROM supplements ORDER BY name COLLATE NOCASE",
  );
}

export async function deleteSupplement(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM supplements WHERE id = ?", id);
}

export async function logSupplement(
  supplementId: number,
  loggedAt?: string,
): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO supplement_log (supplement_id, logged_at)
     VALUES (?, COALESCE(?, datetime('now','localtime')))`,
    supplementId,
    loggedAt ?? null,
  );
  return res.lastInsertRowId;
}

export async function listSupplementLogByDate(
  dateISO: string,
): Promise<SupplementLogEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<SupplementLogEntry>(
    "SELECT * FROM supplement_log WHERE date(logged_at) = date(?) ORDER BY logged_at",
    dateISO,
  );
}

export async function deleteSupplementLog(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM supplement_log WHERE id = ?", id);
}
