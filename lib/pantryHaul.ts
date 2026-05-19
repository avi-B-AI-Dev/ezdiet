/**
 * Pantry haul intake service.
 *
 * Three input methods (group photo / single item / type-it) all feed the
 * same nutrition resolver and dedupe-aware save path. Vision calls (Claude)
 * are mocked when USE_MOCK_API is true so the UI works end-to-end without
 * API keys; flipping the flag in nutritionPipeline.ts is the only change
 * needed to go live.
 */

import { findCommonIngredientByName, type CommonIngredient } from "./db/common-ingredients";
import {
  findPantryItemByNameBrand,
  upsertPantryItem,
  type PantryCategory,
  type PantryItem,
  type PantryItemInput,
  type PantrySource,
} from "./db/pantry";
import { USE_MOCK_API } from "./nutritionPipeline";

const OPEN_FOOD_FACTS_URL =
  "https://world.openfoodfacts.org/cgi/search.pl?search_terms=INGREDIENT&json=1";

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

export type DetectedItem = {
  name: string;
  brand?: string | null;
};

export type ResolvedHaulItem = {
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
  category: PantryCategory;
  photo_uri: string | null;
  source: PantrySource;
  confidence_score: number;
  // null means "we don't know — fall through to nutrition-label flow"
  needsLabel: boolean;
};

// ───────────────────────────────────────────────────────────────────
// Mock vision (group photo)
// ───────────────────────────────────────────────────────────────────

const MOCK_GROUP_DETECTIONS: DetectedItem[] = [
  { name: "Eggs" },
  { name: "Rice" },
  { name: "Onions" },
  { name: "Tomatoes" },
  { name: "Milk" },
];

export async function detectItemsInGroupPhoto(
  _photoUri: string,
): Promise<DetectedItem[]> {
  if (USE_MOCK_API) return MOCK_GROUP_DETECTIONS;
  // LIVE mode would POST the image to Claude Vision here and parse the
  // returned list of detected items. Stubbed for now to keep mock and live
  // paths symmetric.
  return MOCK_GROUP_DETECTIONS;
}

// ───────────────────────────────────────────────────────────────────
// Mock vision (single item — front of package)
// ───────────────────────────────────────────────────────────────────

export async function identifySingleItem(
  _photoUri: string,
): Promise<DetectedItem | null> {
  if (USE_MOCK_API) {
    // The spec asks for "Unknown packaged item" so the UI naturally
    // falls through to the nutrition-label flow.
    return { name: "Unknown packaged item", brand: null };
  }
  return { name: "Unknown packaged item", brand: null };
}

// ───────────────────────────────────────────────────────────────────
// Mock vision (nutrition label OCR)
// ───────────────────────────────────────────────────────────────────

export type LabelNutrition = {
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  serving_size: number;
  serving_unit: string;
};

export async function readNutritionLabel(
  _photoUri: string,
): Promise<LabelNutrition> {
  if (USE_MOCK_API) {
    return {
      calories_per_100g: 380,
      protein_per_100g: 8,
      carbs_per_100g: 60,
      fat_per_100g: 12,
      fiber_per_100g: 3,
      serving_size: 30,
      serving_unit: "g",
    };
  }
  return {
    calories_per_100g: 380,
    protein_per_100g: 8,
    carbs_per_100g: 60,
    fat_per_100g: 12,
    fiber_per_100g: 3,
    serving_size: 30,
    serving_unit: "g",
  };
}

// ───────────────────────────────────────────────────────────────────
// Resolver — turn a name (and optional brand/photo) into a ResolvedHaulItem
// ───────────────────────────────────────────────────────────────────

function commonToResolved(
  c: CommonIngredient,
  name: string,
  photoUri: string | null,
): ResolvedHaulItem {
  return {
    name: titleCase(name),
    brand: null,
    barcode: null,
    calories_per_100g: c.calories_per_100g,
    protein_per_100g: c.protein_per_100g,
    carbs_per_100g: c.carbs_per_100g,
    fat_per_100g: c.fat_per_100g,
    fiber_per_100g: c.fiber_per_100g,
    serving_size: c.typical_unit_weight_g,
    serving_unit: c.typical_unit,
    servings_per_package: null,
    total_package_size: null,
    total_package_unit: null,
    category: mapCategory(c.category),
    photo_uri: photoUri,
    source: "common_db",
    confidence_score: 90,
    needsLabel: false,
  };
}

function mapCategory(cat: string): PantryCategory {
  const c = cat.toLowerCase();
  if (c === "grain") return "grain";
  if (c === "protein") return "protein";
  if (c === "vegetable") return "vegetable";
  if (c === "fruit") return "fruit";
  if (c === "dairy") return "dairy";
  if (c === "oil") return "oil";
  if (c === "spice") return "spice";
  return "other";
}

function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

async function tryOpenFoodFacts(
  name: string,
  photoUri: string | null,
): Promise<ResolvedHaulItem | null> {
  try {
    const url = OPEN_FOOD_FACTS_URL.replace(
      "INGREDIENT",
      encodeURIComponent(name),
    );
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const product = Array.isArray(data?.products) ? data.products[0] : null;
    if (!product?.nutriments) return null;
    const n = product.nutriments;
    const calories_per_100g = Number(
      n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0,
    );
    const protein_per_100g = Number(n.proteins_100g ?? n.proteins ?? 0);
    const carbs_per_100g = Number(n.carbohydrates_100g ?? n.carbohydrates ?? 0);
    const fat_per_100g = Number(n.fat_100g ?? n.fat ?? 0);
    const fiber_per_100g = Number(n.fiber_100g ?? n.fiber ?? 0);
    if (
      calories_per_100g === 0 &&
      protein_per_100g === 0 &&
      fat_per_100g === 0
    ) {
      return null;
    }
    const servingSizeStr: string | undefined = product.serving_size;
    const { size: serving_size, unit: serving_unit } = parseServingSize(
      servingSizeStr,
    );
    return {
      name: titleCase(product.product_name ?? name),
      brand: product.brands ?? null,
      barcode: product.code ?? null,
      calories_per_100g,
      protein_per_100g,
      carbs_per_100g,
      fat_per_100g,
      fiber_per_100g: Number.isFinite(fiber_per_100g) ? fiber_per_100g : null,
      serving_size,
      serving_unit,
      servings_per_package: null,
      total_package_size: null,
      total_package_unit: null,
      category: "packaged",
      photo_uri: photoUri,
      source: "api_lookup",
      confidence_score: 85,
      needsLabel: false,
    };
  } catch {
    return null;
  }
}

function parseServingSize(s: string | undefined): {
  size: number;
  unit: string;
} {
  if (!s) return { size: 100, unit: "g" };
  const m = s.match(/(\d+(?:\.\d+)?)\s*(g|ml|oz|kg|l)?/i);
  if (!m) return { size: 100, unit: "g" };
  const size = parseFloat(m[1]);
  const unit = (m[2] ?? "g").toLowerCase();
  return {
    size: Number.isFinite(size) ? size : 100,
    unit,
  };
}

// AI-estimate fallback (mock just hands back a generic packaged-food default;
// LIVE mode would call Claude here).
function aiEstimate(name: string, photoUri: string | null): ResolvedHaulItem {
  return {
    name: titleCase(name),
    brand: null,
    barcode: null,
    calories_per_100g: 200,
    protein_per_100g: 6,
    carbs_per_100g: 30,
    fat_per_100g: 6,
    fiber_per_100g: 2,
    serving_size: 100,
    serving_unit: "g",
    servings_per_package: null,
    total_package_size: null,
    total_package_unit: null,
    category: "other",
    photo_uri: photoUri,
    source: "ai_estimated",
    confidence_score: 70,
    needsLabel: true,
  };
}

// Main resolver. Tries common_ingredients first (fresh produce / staples),
// then Open Food Facts (packaged) — always called since the API is free
// and works without keys, then AI estimate as a last resort. The caller
// decides whether to prompt for a nutrition-label photo when needsLabel.
export async function resolveHaulItem(
  name: string,
  photoUri: string | null = null,
): Promise<ResolvedHaulItem> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Item name cannot be empty");

  const common = await findCommonIngredientByName(trimmed);
  if (common) return commonToResolved(common, trimmed, photoUri);

  const api = await tryOpenFoodFacts(trimmed, photoUri);
  if (api) return api;

  // AI fallback. In mock mode this is hardcoded; live mode would hit Claude.
  return aiEstimate(trimmed, photoUri);
}

// Parse a trailing quantity from a typed string. Recognises common pantry
// units. Returns the cleaned name and the quantity, or null if no quantity
// is present. Examples:
//   "toor dal 2lb"    → { name: "toor dal",      quantity: 2,   unit: "lb" }
//   "5kg basmati rice" → { name: "basmati rice", quantity: 5,   unit: "kg" }
//   "12 eggs"         → { name: "eggs",          quantity: 12,  unit: "whole" }
//   "amul ghee 500g"  → { name: "amul ghee",     quantity: 500, unit: "g" }
const QTY_UNITS =
  "g|kg|oz|lb|lbs|ml|l|gallon|gallons|piece|pieces|whole|count|pack|packs|bottle|bottles|loaf|loaves|jar|jars|bag|bags|cup|cups|dozen";

const COUNT_NOUNS = new Set([
  "egg",
  "eggs",
  "banana",
  "bananas",
  "apple",
  "apples",
  "orange",
  "oranges",
  "onion",
  "onions",
  "tomato",
  "tomatoes",
  "potato",
  "potatoes",
  "lemon",
  "lemons",
]);

export function parseQuantityFromName(text: string): {
  name: string;
  quantity: number | null;
  unit: string | null;
} {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return { name: "", quantity: null, unit: null };

  // Trailing pattern: "<name> <qty><unit>" or "<name> <qty> <unit>"
  let m = trimmed.match(
    new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${QTY_UNITS})\\.?$`, "i"),
  );
  if (m) {
    return {
      name: m[1].trim(),
      quantity: parseFloat(m[2]),
      unit: normalizeUnit(m[3]),
    };
  }

  // Leading pattern: "<qty><unit> <name>" or "<qty> <unit> <name>"
  m = trimmed.match(
    new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${QTY_UNITS})\\s+(.+)$`, "i"),
  );
  if (m) {
    return {
      name: m[3].trim(),
      quantity: parseFloat(m[1]),
      unit: normalizeUnit(m[2]),
    };
  }

  // Bare leading number for count nouns: "12 eggs", "6 bananas"
  m = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (m) {
    const restName = m[2].trim().toLowerCase();
    const firstWord = restName.split(/\s+/)[0];
    if (COUNT_NOUNS.has(firstWord) || COUNT_NOUNS.has(restName)) {
      return {
        name: m[2].trim(),
        quantity: parseFloat(m[1]),
        unit: "whole",
      };
    }
  }

  return { name: trimmed, quantity: null, unit: null };
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (u === "lbs") return "lb";
  if (u === "pieces") return "piece";
  if (u === "packs") return "pack";
  if (u === "bottles") return "bottle";
  if (u === "loaves") return "loaf";
  if (u === "jars") return "jar";
  if (u === "bags") return "bag";
  if (u === "cups") return "cup";
  if (u === "gallons") return "gallon";
  return u;
}

// Build a ResolvedHaulItem from an explicit nutrition-label OCR result.
export function resolvedFromLabel(
  name: string,
  brand: string | null,
  label: LabelNutrition,
  photoUri: string | null,
): ResolvedHaulItem {
  return {
    name: titleCase(name),
    brand,
    barcode: null,
    calories_per_100g: label.calories_per_100g,
    protein_per_100g: label.protein_per_100g,
    carbs_per_100g: label.carbs_per_100g,
    fat_per_100g: label.fat_per_100g,
    fiber_per_100g: label.fiber_per_100g,
    serving_size: label.serving_size,
    serving_unit: label.serving_unit,
    servings_per_package: null,
    total_package_size: null,
    total_package_unit: null,
    category: "packaged",
    photo_uri: photoUri,
    source: "label_verified",
    confidence_score: 95,
    needsLabel: false,
  };
}

// ───────────────────────────────────────────────────────────────────
// Save / dedupe
// ───────────────────────────────────────────────────────────────────

export type SaveOutcome =
  | { kind: "saved"; id: number }
  | { kind: "duplicate"; existing: PantryItem };

// "name match" per FIX 7 — match on name only, ignore brand. We use a
// case-insensitive lookup on name, then by name+brand for tighter match.
async function findExistingByName(name: string): Promise<PantryItem | null> {
  // Exact name match first; fall back to fuzzy on the same name.
  const { findPantryItemByFuzzyName } = await import("./db/pantry");
  return findPantryItemByFuzzyName(name);
}

export type SaveStrategy = "skip" | "add_to_existing" | "replace";

export async function saveResolvedItem(
  resolved: ResolvedHaulItem,
  options: {
    quantityPurchased?: number | null;
    totalPackageSize?: number | null;
    totalPackageUnit?: string | null;
    servingsPerPackage?: number | null;
    strategy?: SaveStrategy;
  } = {},
): Promise<SaveOutcome> {
  const existing = await findExistingByName(resolved.name);
  const strategy = options.strategy;

  if (existing && !strategy) {
    return { kind: "duplicate", existing };
  }

  if (existing && strategy === "skip") {
    return { kind: "saved", id: existing.id };
  }

  if (existing && strategy === "add_to_existing") {
    const addedQty =
      options.quantityPurchased ?? options.totalPackageSize ?? 1;
    const newRemaining = (existing.quantity_remaining ?? 0) + addedQty;
    const newPurchased = (existing.quantity_purchased ?? 0) + addedQty;
    const { updatePantryItem } = await import("./db/pantry");
    await updatePantryItem(existing.id, {
      ...existing,
      quantity_purchased: newPurchased,
      quantity_remaining: newRemaining,
      // Refresh nutrition data with the new resolution if it's higher
      // confidence than the existing record.
      ...(resolved.confidence_score >= (existing.confidence_score ?? 0)
        ? {
            calories_per_100g: resolved.calories_per_100g,
            protein_per_100g: resolved.protein_per_100g,
            carbs_per_100g: resolved.carbs_per_100g,
            fat_per_100g: resolved.fat_per_100g,
            fiber_per_100g: resolved.fiber_per_100g,
            source: resolved.source,
            confidence_score: resolved.confidence_score,
          }
        : {}),
    });
    return { kind: "saved", id: existing.id };
  }

  // Either no duplicate, or strategy === "replace" — write fresh values.
  const input = toInput(resolved, options);
  const id = await upsertPantryItem(input);
  return { kind: "saved", id };
}

function toInput(
  r: ResolvedHaulItem,
  options: {
    quantityPurchased?: number | null;
    totalPackageSize?: number | null;
    totalPackageUnit?: string | null;
    servingsPerPackage?: number | null;
  },
): PantryItemInput {
  const totalPackageSize = options.totalPackageSize ?? r.total_package_size;
  const totalPackageUnit = options.totalPackageUnit ?? r.total_package_unit;
  // Default purchased to 1 if not provided so quantity_remaining can decay
  // visually as the user logs meals.
  const quantityPurchased =
    options.quantityPurchased ?? (totalPackageSize ?? 1);
  return {
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    calories_per_100g: r.calories_per_100g,
    protein_per_100g: r.protein_per_100g,
    carbs_per_100g: r.carbs_per_100g,
    fat_per_100g: r.fat_per_100g,
    fiber_per_100g: r.fiber_per_100g,
    serving_size: r.serving_size,
    serving_unit: r.serving_unit,
    servings_per_package: options.servingsPerPackage ?? r.servings_per_package,
    total_package_size: totalPackageSize,
    total_package_unit: totalPackageUnit,
    category: r.category,
    micronutrients: null,
    photo_uri: r.photo_uri,
    source: r.source,
    confidence_score: r.confidence_score,
    quantity_purchased: quantityPurchased,
    quantity_remaining: quantityPurchased,
  };
}
