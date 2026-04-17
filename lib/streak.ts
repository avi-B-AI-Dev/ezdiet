import { addDaysISO, localDateISO } from "@/lib/date";
import { getDatabase } from "@/lib/db";

export async function computeStreak(): Promise<number> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ d: string }>(
    "SELECT DISTINCT date(logged_at) AS d FROM meals ORDER BY d DESC LIMIT 365",
  );
  if (rows.length === 0) return 0;

  const today = localDateISO();
  const yesterday = addDaysISO(today, -1);

  let cursor: string;
  if (rows[0].d === today) cursor = today;
  else if (rows[0].d === yesterday) cursor = yesterday;
  else return 0;

  const daySet = new Set(rows.map((r) => r.d));
  let streak = 0;
  while (daySet.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}
