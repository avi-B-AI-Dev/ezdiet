import {
  addDaysISO,
  addMonthsISO,
  getDayOfWeek,
  localDateISO,
} from "@/lib/date";

import { getDatabase } from "./client";

export type SupplementFrequency =
  | "daily"
  | "twice_weekly"
  | "weekly"
  | "biweekly"
  | "monthly";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "with_meal";

export type SupplementLogStatus = "taken" | "skipped";

export const SUPPLEMENT_FREQUENCY_LABEL: Record<SupplementFrequency, string> = {
  daily: "Daily",
  twice_weekly: "Twice a week",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  with_meal: "With meal",
};

export type Supplement = {
  id: number;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients: string | null;
  frequency: SupplementFrequency | null;
  time_of_day: TimeOfDay | null;
  start_date: string | null;
  twice_weekly_days: string | null;
  created_at: string;
};

export type SupplementInput = Omit<Supplement, "id" | "created_at">;

export type SupplementLogEntry = {
  id: number;
  supplement_id: number;
  scheduled_date: string | null;
  taken_at: string | null;
  status: string | null;
  logged_at: string;
};

export function parseTwiceWeeklyDays(s: string | null | undefined): number[] {
  if (!s) return [];
  return s
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
}

export function serializeTwiceWeeklyDays(days: number[]): string {
  return days
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b)
    .join(",");
}

export async function createSupplement(s: SupplementInput): Promise<number> {
  const db = await getDatabase();
  const res = await db.runAsync(
    `INSERT INTO supplements
       (name, brand, calories, protein, carbs, fat, micronutrients,
        frequency, time_of_day, start_date, twice_weekly_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.name,
    s.brand,
    s.calories,
    s.protein,
    s.carbs,
    s.fat,
    s.micronutrients,
    s.frequency,
    s.time_of_day,
    s.start_date,
    s.twice_weekly_days,
  );
  return res.lastInsertRowId;
}

export async function updateSupplement(
  id: number,
  s: SupplementInput,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE supplements SET
       name = ?, brand = ?, calories = ?, protein = ?, carbs = ?, fat = ?,
       micronutrients = ?, frequency = ?, time_of_day = ?, start_date = ?,
       twice_weekly_days = ?
     WHERE id = ?`,
    s.name,
    s.brand,
    s.calories,
    s.protein,
    s.carbs,
    s.fat,
    s.micronutrients,
    s.frequency,
    s.time_of_day,
    s.start_date,
    s.twice_weekly_days,
    id,
  );
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
  const today = localDateISO();
  const res = await db.runAsync(
    `INSERT INTO supplement_log (supplement_id, scheduled_date, taken_at, status, logged_at)
     VALUES (?, ?, COALESCE(?, datetime('now','localtime')), 'taken', COALESCE(?, datetime('now','localtime')))`,
    supplementId,
    today,
    loggedAt ?? null,
    loggedAt ?? null,
  );
  return res.lastInsertRowId;
}

export async function listSupplementLogByDate(
  dateISO: string,
): Promise<SupplementLogEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<SupplementLogEntry>(
    "SELECT * FROM supplement_log WHERE COALESCE(scheduled_date, date(logged_at)) = date(?) ORDER BY logged_at",
    dateISO,
  );
}

export async function deleteSupplementLog(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM supplement_log WHERE id = ?", id);
}

export async function markOccurrenceTaken(
  supplementId: number,
  scheduledDate: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM supplement_log WHERE supplement_id = ? AND COALESCE(scheduled_date, date(logged_at)) = date(?)",
    supplementId,
    scheduledDate,
  );
  await db.runAsync(
    "INSERT INTO supplement_log (supplement_id, scheduled_date, taken_at, status, logged_at) VALUES (?, ?, datetime('now','localtime'), 'taken', datetime('now','localtime'))",
    supplementId,
    scheduledDate,
  );
}

export async function unmarkOccurrence(
  supplementId: number,
  scheduledDate: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM supplement_log WHERE supplement_id = ? AND COALESCE(scheduled_date, date(logged_at)) = date(?)",
    supplementId,
    scheduledDate,
  );
}

export async function toggleOccurrence(
  supplementId: number,
  scheduledDate: string,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number; status: string | null }>(
    "SELECT id, status FROM supplement_log WHERE supplement_id = ? AND COALESCE(scheduled_date, date(logged_at)) = date(?) LIMIT 1",
    supplementId,
    scheduledDate,
  );
  if (row && (row.status === "taken" || row.status === null)) {
    await db.runAsync("DELETE FROM supplement_log WHERE id = ?", row.id);
    return false;
  }
  if (row) {
    await db.runAsync(
      "UPDATE supplement_log SET status = 'taken', taken_at = datetime('now','localtime'), logged_at = datetime('now','localtime'), scheduled_date = ? WHERE id = ?",
      scheduledDate,
      row.id,
    );
  } else {
    await db.runAsync(
      "INSERT INTO supplement_log (supplement_id, scheduled_date, taken_at, status, logged_at) VALUES (?, ?, datetime('now','localtime'), 'taken', datetime('now','localtime'))",
      supplementId,
      scheduledDate,
    );
  }
  return true;
}

export async function dismissOccurrence(
  supplementId: number,
  scheduledDate: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM supplement_log WHERE supplement_id = ? AND COALESCE(scheduled_date, date(logged_at)) = date(?)",
    supplementId,
    scheduledDate,
  );
  await db.runAsync(
    "INSERT INTO supplement_log (supplement_id, scheduled_date, taken_at, status, logged_at) VALUES (?, ?, NULL, 'skipped', datetime('now','localtime'))",
    supplementId,
    scheduledDate,
  );
}

function nextScheduleCursor(
  s: Supplement,
  current: string,
): string | null {
  const freq = s.frequency;
  if (freq === "weekly") return addDaysISO(current, 7);
  if (freq === "biweekly") return addDaysISO(current, 14);
  if (freq === "monthly") return addMonthsISO(current, 1);
  if (freq === "twice_weekly") {
    const days = parseTwiceWeeklyDays(s.twice_weekly_days);
    if (!days.length) return null;
    let next = addDaysISO(current, 1);
    for (let i = 0; i < 14; i++) {
      if (days.includes(getDayOfWeek(next))) return next;
      next = addDaysISO(next, 1);
    }
    return null;
  }
  return null;
}

function firstCursor(s: Supplement, today: string): string | null {
  if (!s.start_date) return today;
  if (s.frequency === "twice_weekly") {
    const days = parseTwiceWeeklyDays(s.twice_weekly_days);
    if (!days.length) return null;
    let cursor = s.start_date;
    for (let i = 0; i < 14; i++) {
      if (days.includes(getDayOfWeek(cursor))) return cursor;
      cursor = addDaysISO(cursor, 1);
    }
    return null;
  }
  return s.start_date;
}

export type DashboardSupplement = {
  supplement: Supplement;
  isDaily: boolean;
  todayScheduled: boolean;
  takenToday: boolean;
  missedDates: string[];
  nextScheduledDate: string | null;
};

export async function listDashboardSupplements(): Promise<
  DashboardSupplement[]
> {
  const db = await getDatabase();
  const today = localDateISO();
  const supplements = await listSupplements();
  const results: DashboardSupplement[] = [];

  for (const s of supplements) {
    if (s.start_date && s.start_date > today) continue;

    const freq = s.frequency ?? "daily";
    const isDaily = freq === "daily";

    if (isDaily) {
      const todayRow = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM supplement_log
         WHERE supplement_id = ?
           AND COALESCE(scheduled_date, date(logged_at)) = date(?)
           AND (status IS NULL OR status = 'taken')
         LIMIT 1`,
        s.id,
        today,
      );
      results.push({
        supplement: s,
        isDaily: true,
        todayScheduled: true,
        takenToday: !!todayRow,
        missedDates: [],
        nextScheduledDate: null,
      });
      continue;
    }

    const logs = await db.getAllAsync<{
      scheduled_date: string | null;
      status: string | null;
    }>(
      `SELECT COALESCE(scheduled_date, date(logged_at)) AS scheduled_date, status
       FROM supplement_log WHERE supplement_id = ?`,
      s.id,
    );
    const logByDate = new Map<string, string>();
    for (const l of logs) {
      if (l.scheduled_date) {
        logByDate.set(l.scheduled_date, l.status ?? "taken");
      }
    }

    const maxDate = addMonthsISO(today, 3);
    let todayScheduled = false;
    let takenToday = false;
    const missedDates: string[] = [];
    let nextScheduledDate: string | null = null;

    let cursor: string | null = firstCursor(s, today);
    let iterations = 0;
    while (cursor && cursor <= maxDate && iterations < 500) {
      iterations++;
      const status = logByDate.get(cursor);

      if (cursor < today) {
        if (!status) missedDates.push(cursor);
      } else if (cursor === today) {
        todayScheduled = true;
        if (status === "taken") takenToday = true;
      } else if (!status && nextScheduledDate === null) {
        nextScheduledDate = cursor;
      }

      const nxt = nextScheduleCursor(s, cursor);
      if (!nxt) break;
      cursor = nxt;
    }

    results.push({
      supplement: s,
      isDaily: false,
      todayScheduled,
      takenToday,
      missedDates,
      nextScheduledDate,
    });
  }
  return results;
}

// Kept for backward compatibility with callers of the older name.
export async function toggleSupplementToday(
  supplementId: number,
): Promise<boolean> {
  return toggleOccurrence(supplementId, localDateISO());
}
