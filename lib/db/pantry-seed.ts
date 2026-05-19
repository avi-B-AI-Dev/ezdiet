import * as SQLite from "expo-sqlite";

import type { PantryCategory, PantrySource } from "./pantry";

type SeedItem = {
  name: string;
  brand?: string | null;
  category: PantryCategory;
  source: PantrySource;
  confidence_score: number;
  // Per 100g nutrition
  cal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  // Serving info — what the meal logger uses
  serving_size: number;
  serving_unit: string;
  // Inventory
  total_package_size: number;
  total_package_unit: string;
  quantity_purchased: number;
  quantity_remaining: number;
};

// 15 sample items per the spec. Quantities chosen so 4 items land in
// "Low Stock" (<20% remaining) and the Fresh/Packaged buckets are populated.
const SAMPLE: SeedItem[] = [
  {
    name: "Eggs",
    category: "protein",
    source: "common_db",
    confidence_score: 90,
    cal: 143, protein: 12.6, carbs: 0.7, fat: 9.5,
    serving_size: 50, serving_unit: "1 whole",
    total_package_size: 12, total_package_unit: "whole",
    quantity_purchased: 12, quantity_remaining: 10,
  },
  {
    name: "Basmati Rice",
    category: "grain",
    source: "common_db",
    confidence_score: 90,
    cal: 121, protein: 3.5, carbs: 25, fat: 0.4,
    serving_size: 158, serving_unit: "1 cup cooked",
    total_package_size: 5, total_package_unit: "kg",
    quantity_purchased: 5, quantity_remaining: 4.5,
  },
  {
    name: "Toor Dal",
    category: "grain",
    source: "common_db",
    confidence_score: 90,
    cal: 343, protein: 22, carbs: 63, fat: 1.5, fiber: 15,
    serving_size: 200, serving_unit: "1 cup dry",
    total_package_size: 2, total_package_unit: "lb",
    quantity_purchased: 2, quantity_remaining: 1.8,
  },
  {
    name: "Whole Milk",
    category: "dairy",
    source: "common_db",
    confidence_score: 90,
    cal: 61, protein: 3.2, carbs: 4.8, fat: 3.3,
    serving_size: 244, serving_unit: "1 cup",
    total_package_size: 1, total_package_unit: "gallon",
    quantity_purchased: 1, quantity_remaining: 0.5,
  },
  {
    name: "Onions",
    category: "vegetable",
    source: "common_db",
    confidence_score: 90,
    cal: 40, protein: 1.1, carbs: 9.3, fat: 0.1,
    serving_size: 110, serving_unit: "1 medium",
    total_package_size: 6, total_package_unit: "whole",
    quantity_purchased: 6, quantity_remaining: 4,
  },
  {
    name: "Tomatoes",
    category: "vegetable",
    source: "common_db",
    confidence_score: 90,
    cal: 18, protein: 0.9, carbs: 3.9, fat: 0.2,
    serving_size: 150, serving_unit: "1 medium",
    total_package_size: 8, total_package_unit: "whole",
    quantity_purchased: 8, quantity_remaining: 5,
  },
  {
    name: "Chicken Breast",
    category: "protein",
    source: "common_db",
    confidence_score: 90,
    cal: 165, protein: 31, carbs: 0, fat: 3.6,
    serving_size: 100, serving_unit: "100g",
    total_package_size: 2, total_package_unit: "lb",
    quantity_purchased: 2, quantity_remaining: 0.3, // low stock
  },
  {
    name: "Ghee",
    brand: "Amul",
    // Dairy so the Fresh filter picks it up; spec says ghee shows in Fresh.
    category: "dairy",
    source: "common_db",
    confidence_score: 90,
    cal: 862, protein: 0, carbs: 0, fat: 100,
    serving_size: 14, serving_unit: "1 tablespoon",
    total_package_size: 500, total_package_unit: "g",
    quantity_purchased: 500, quantity_remaining: 80, // low stock
  },
  {
    name: "Olive Oil",
    category: "oil",
    source: "common_db",
    confidence_score: 90,
    cal: 884, protein: 0, carbs: 0, fat: 100,
    serving_size: 14, serving_unit: "1 tablespoon",
    total_package_size: 500, total_package_unit: "ml",
    quantity_purchased: 500, quantity_remaining: 400,
  },
  {
    name: "Bread",
    brand: "Wonder",
    category: "grain",
    source: "common_db",
    confidence_score: 90,
    cal: 265, protein: 9, carbs: 49, fat: 3.2,
    serving_size: 28, serving_unit: "1 slice",
    total_package_size: 20, total_package_unit: "slice",
    quantity_purchased: 20, quantity_remaining: 3, // low stock
  },
  {
    name: "Bananas",
    category: "fruit",
    source: "common_db",
    confidence_score: 90,
    cal: 89, protein: 1.1, carbs: 23, fat: 0.3,
    serving_size: 118, serving_unit: "1 medium",
    total_package_size: 6, total_package_unit: "whole",
    quantity_purchased: 6, quantity_remaining: 1, // low stock
  },
  {
    name: "Yogurt",
    category: "dairy",
    source: "common_db",
    confidence_score: 90,
    cal: 59, protein: 10, carbs: 3.6, fat: 0.4,
    serving_size: 245, serving_unit: "1 cup",
    total_package_size: 500, total_package_unit: "g",
    quantity_purchased: 500, quantity_remaining: 200,
  },
  {
    name: "Spinach",
    category: "vegetable",
    source: "common_db",
    confidence_score: 90,
    cal: 23, protein: 2.9, carbs: 3.6, fat: 0.4,
    serving_size: 30, serving_unit: "1 cup",
    total_package_size: 200, total_package_unit: "g",
    quantity_purchased: 200, quantity_remaining: 30, // low stock
  },
  {
    name: "Paneer",
    category: "dairy",
    source: "common_db",
    confidence_score: 90,
    cal: 265, protein: 18, carbs: 1.2, fat: 21,
    serving_size: 100, serving_unit: "100g",
    total_package_size: 400, total_package_unit: "g",
    quantity_purchased: 400, quantity_remaining: 400,
  },
  {
    name: "Sugar",
    category: "grain",
    source: "common_db",
    confidence_score: 90,
    cal: 387, protein: 0, carbs: 100, fat: 0,
    serving_size: 12, serving_unit: "1 tablespoon",
    total_package_size: 1, total_package_unit: "kg",
    quantity_purchased: 1, quantity_remaining: 0.8,
  },
];

export async function seedSamplePantryIfEmpty(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM pantry_items",
  );
  if ((row?.c ?? 0) > 0) return;

  await db.withTransactionAsync(async () => {
    for (const s of SAMPLE) {
      await db.runAsync(
        `INSERT OR IGNORE INTO pantry_items
           (name, brand, barcode,
            calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g,
            serving_size, serving_unit,
            servings_per_package, total_package_size, total_package_unit,
            category, micronutrients, photo_uri, source, confidence_score,
            quantity_purchased, quantity_remaining)
         VALUES (?, ?, NULL,
                 ?, ?, ?, ?, ?,
                 ?, ?,
                 NULL, ?, ?,
                 ?, NULL, NULL, ?, ?,
                 ?, ?)`,
        s.name,
        s.brand ?? null,
        s.cal,
        s.protein,
        s.carbs,
        s.fat,
        s.fiber ?? 0,
        s.serving_size,
        s.serving_unit,
        s.total_package_size,
        s.total_package_unit,
        s.category,
        s.source,
        s.confidence_score,
        s.quantity_purchased,
        s.quantity_remaining,
      );
    }
  });
}
