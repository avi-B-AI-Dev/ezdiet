import { getDatabase } from "./client";

export type WaterEntry = {
  id: number;
  amount_ml: number;
  logged_at: string;
};

export async function logWater(
  amountMl: number,
  loggedAt?: string,
): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO water_log (amount_ml, logged_at)
     VALUES (?, COALESCE(?, datetime('now','localtime')))`,
    amountMl,
    loggedAt ?? null,
  );
  return res.lastInsertRowId;
}

export async function listWaterByDate(dateISO: string): Promise<WaterEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<WaterEntry>(
    "SELECT * FROM water_log WHERE date(logged_at) = date(?) ORDER BY logged_at",
    dateISO,
  );
}

export async function deleteWaterEntry(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM water_log WHERE id = ?", id);
}
