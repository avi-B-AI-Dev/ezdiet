import * as SQLite from "expo-sqlite";

const DB_NAME = "ezdiet.db";

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_calorie_goal INTEGER NOT NULL,
  daily_protein_goal INTEGER NOT NULL,
  daily_carbs_goal INTEGER NOT NULL,
  daily_fat_goal INTEGER NOT NULL,
  water_unit TEXT NOT NULL DEFAULT 'glasses' CHECK (water_unit IN ('glasses','oz','liters')),
  water_goal REAL NOT NULL DEFAULT 8,
  name TEXT,
  age INTEGER,
  gender TEXT,
  height_cm REAL,
  weight_kg REAL,
  goal_weight_kg REAL,
  timeframe_weeks INTEGER,
  activity_level TEXT,
  composition_goal TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pantry_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  calories_per_100g REAL NOT NULL,
  protein_per_100g REAL NOT NULL,
  carbs_per_100g REAL NOT NULL,
  fat_per_100g REAL NOT NULL,
  fiber_per_100g REAL,
  serving_size REAL NOT NULL,
  serving_unit TEXT NOT NULL,
  micronutrients TEXT,
  photo_uri TEXT,
  source TEXT NOT NULL CHECK (source IN ('scanned','manual','api_lookup','ai_estimated')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, brand)
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  input_type TEXT NOT NULL CHECK (input_type IN ('home_cooked','packaged','frozen_instant','chain_restaurant','local_restaurant','drink','fruit_raw','combination')),
  description TEXT NOT NULL,
  total_calories REAL NOT NULL,
  total_protein REAL NOT NULL,
  total_carbs REAL NOT NULL,
  total_fat REAL NOT NULL,
  servings REAL NOT NULL DEFAULT 1,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meal_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  pantry_item_id INTEGER REFERENCES pantry_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  total_calories REAL NOT NULL,
  total_protein REAL NOT NULL,
  total_carbs REAL NOT NULL,
  total_fat REAL NOT NULL,
  default_servings REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES saved_recipes(id) ON DELETE CASCADE,
  pantry_item_id INTEGER REFERENCES pantry_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS supplements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  brand TEXT,
  calories REAL NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  micronutrients TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supplement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplement_id INTEGER NOT NULL REFERENCES supplements(id) ON DELETE CASCADE,
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS water_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('glasses','oz','liters')),
  logged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meals_logged_at ON meals(logged_at);
CREATE INDEX IF NOT EXISTS idx_meal_ingredients_meal_id ON meal_ingredients(meal_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_supplement_log_logged_at ON supplement_log(logged_at);
CREATE INDEX IF NOT EXISTS idx_water_log_logged_at ON water_log(logged_at);
CREATE INDEX IF NOT EXISTS idx_pantry_name ON pantry_items(name);
CREATE INDEX IF NOT EXISTS idx_pantry_barcode ON pantry_items(barcode);
`;

const USER_MIGRATIONS: string[] = [
  "ALTER TABLE users ADD COLUMN name TEXT",
  "ALTER TABLE users ADD COLUMN age INTEGER",
  "ALTER TABLE users ADD COLUMN gender TEXT",
  "ALTER TABLE users ADD COLUMN height_cm REAL",
  "ALTER TABLE users ADD COLUMN weight_kg REAL",
  "ALTER TABLE users ADD COLUMN goal_weight_kg REAL",
  "ALTER TABLE users ADD COLUMN timeframe_weeks INTEGER",
  "ALTER TABLE users ADD COLUMN activity_level TEXT",
  "ALTER TABLE users ADD COLUMN composition_goal TEXT",
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA_SQL);
      for (const sql of USER_MIGRATIONS) {
        try {
          await db.execAsync(sql);
        } catch {
          // column already exists — ignore
        }
      }
      return db;
    })();
  }
  return dbPromise;
}

export async function initDatabase(): Promise<void> {
  await getDatabase();
}

export async function resetDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.closeAsync();
    } catch {
      // ignore — we're deleting it anyway
    }
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
}
