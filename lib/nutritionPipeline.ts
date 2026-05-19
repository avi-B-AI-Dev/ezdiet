/**
 * 6-Agent Agentic Nutrition Pipeline
 *
 * Set USE_MOCK_API = false and add CLAUDE_API_KEY to go live.
 * The pipeline structure is identical in both modes.
 */

import {
  findCachedNutrition,
  saveCachedNutrition,
} from "./db/nutrition-cache";
import {
  findCommonIngredientByName,
  type CommonIngredient,
} from "./db/common-ingredients";
import { searchPantryItems, type PantryItem } from "./db/pantry";
import {
  detectCookingState,
  getCookingRatio,
  resolveCookingState,
  type CookingState,
} from "./cookingState";

// What form is the per-100g profile keyed in? Detect from typical_unit
// strings like "1 cup cooked" / "1 cup dry". Returns null when ambiguous.
function profileCookingForm(typical_unit: string | null | undefined): "raw" | "cooked" | null {
  if (!typical_unit) return null;
  if (/cooked|boiled|steamed/i.test(typical_unit)) return "cooked";
  if (/dry|raw|uncooked/i.test(typical_unit)) return "raw";
  return null;
}

// When the per-100g profile and the user's cooking state disagree, scale
// macros so the calorie figure reflects the form the user actually ate.
//   profile cooked + user raw    → multiply by ratio (raw is denser)
//   profile raw    + user cooked → divide by ratio (cooked is diluted)
// Returns 1 if no adjustment is needed.
function macroScaleForCookingMismatch(
  name: string,
  typical_unit: string | null | undefined,
  userState: CookingState,
): number {
  const profile = profileCookingForm(typical_unit);
  if (!profile) return 1;
  if (userState === "irrelevant") return 1;
  if (profile === userState) return 1;
  const ratio = getCookingRatio(name) ?? 2.5;
  if (profile === "cooked" && userState === "raw") return ratio;
  if (profile === "raw" && userState === "cooked") return 1 / ratio;
  return 1;
}

export const USE_MOCK_API = true;
const CLAUDE_API_KEY = ""; // flip USE_MOCK_API to false and fill in to go live
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-opus-4-7";
const OPEN_FOOD_FACTS_URL =
  "https://world.openfoodfacts.org/cgi/search.pl?search_terms=INGREDIENT&json=1";

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

export type PipelineStep =
  | "parsing"
  | "pantry"
  | "cache"
  | "api"
  | "ai"
  | "aggregating"
  | "done";

export const PIPELINE_STEP_LABEL: Record<PipelineStep, string> = {
  parsing: "Parsing ingredients...",
  pantry: "Checking pantry...",
  cache: "Checking cache...",
  api: "Looking up nutrition...",
  ai: "Estimating unknown items...",
  aggregating: "Calculating...",
  done: "Done",
};

// Each agent returns one of these four sources. The badge and the pantry
// decrement logic both branch on this value, so keep them aligned:
//   'pantry'          → user's actual pantry inventory (decrements on use)
//   'cache'           → built-in common_ingredients DB or the agent cache
//   'open_food_facts' → live API hit (Agent 4)
//   'ai_estimate'     → fallback AI estimation (Agent 5)
// 'manual' is kept for legacy meal/recipe rows hydrated from old DB writes.
export type NutritionSource =
  | "pantry"
  | "cache"
  | "open_food_facts"
  | "ai_estimate"
  | "manual";

export type ColorCode = "red" | "yellow" | "gray" | "none";

export type ParsedIngredient = {
  name: string;
  quantity: number;
  unit: string;
  cooking_state: CookingState;
};

export type ResolvedIngredient = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  assumed_weight_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: number;
  source: NutritionSource;
  cooking_state: CookingState;
  flagged?: boolean;
  flagReason?: string;
  colorCode: ColorCode;
  category?: string;
};

export type SpiceGroup = {
  kind: "spiceGroup";
  id: string;
  names: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type DisplayItem =
  | ({ kind: "ingredient" } & ResolvedIngredient)
  | SpiceGroup;

export type PipelineResult = {
  items: DisplayItem[];
  rawIngredients: ResolvedIngredient[];
  subtotal: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  warnings: string[];
};

export type PipelineOptions = {
  onStep?: (step: PipelineStep) => void;
};

// ───────────────────────────────────────────────────────────────────
// Agent 1 - Parser
// ───────────────────────────────────────────────────────────────────

const UNIT_ALIASES: Record<string, string> = {
  cup: "cup", cups: "cup",
  tbsp: "tablespoon", tablespoon: "tablespoon", tablespoons: "tablespoon",
  spoon: "tablespoon", spoons: "tablespoon",
  tsp: "teaspoon", teaspoon: "teaspoon", teaspoons: "teaspoon",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  oz: "oz", ounce: "oz", ounces: "oz",
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", liter: "l", liters: "l",
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece",
  clove: "clove", cloves: "clove",
  scoop: "scoop", scoops: "scoop",
  pinch: "pinch", pinches: "pinch",
  handful: "handful", handfuls: "handful",
  medium: "medium", small: "small", large: "large",
  whole: "whole",
};

const WORD_NUMBERS: Record<string, number> = {
  half: 0.5, quarter: 0.25, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1,
};

function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (WORD_NUMBERS[trimmed] !== undefined) return WORD_NUMBERS[trimmed];
  // mixed fraction like "1 1/2"
  const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  }
  // simple fraction "1/2"
  const frac = trimmed.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

// Strip filler words ("of", "some", "a bit of", "about", "bit of", ...)
// from anywhere they show up at the start of an ingredient phrase.
// Run iteratively so chained fillers like "of some ghee" peel off cleanly.
function stripFillers(name: string): string {
  let cleaned = name.trim();
  for (let i = 0; i < 5; i += 1) {
    const next = cleaned.replace(
      /^(of|some|a\s+bit\s+of|a\s+bit|bit\s+of|bit|a\s+little\s+(?:bit\s+)?of|a\s+little|little\s+of|about|approximately|approx\.?|roughly)\s+/i,
      "",
    );
    if (next === cleaned) break;
    cleaned = next.trim();
  }
  return cleaned;
}

// Trailing-weight unit recognition: "chicken 500g", "paneer 200g", "rice 300 g"
const TRAILING_UNITS =
  "g|kg|oz|lb|lbs|ml|l|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|spoon|spoons|piece|pieces|slice|slices|clove|cloves|scoop|scoops";

// parseSinglePhrase returns the old shape (no cooking_state). The wrapper
// `parsePhraseWithCookingState` handles raw/cooked detection and decoration.
type RawParsed = { name: string; quantity: number; unit: string };

function parsePhraseWithCookingState(raw: string): ParsedIngredient | null {
  const { cleanedName: cleanedText, detected } = detectCookingState(raw);
  const partial = parseSinglePhrase(cleanedText);
  if (!partial) return null;
  return {
    ...partial,
    cooking_state: resolveCookingState(partial.name, detected),
  };
}

function parseSinglePhrase(raw: string): RawParsed | null {
  // Strip leading filler words FIRST, so "a bit of butter" → "butter" before
  // we try to interpret "a" as quantity 1.
  const text = stripFillers(raw.trim().replace(/\s+/g, " "));
  if (!text) return null;

  // "a pinch of X" / "pinch of X"
  const pinchMatch = text.match(/^(?:a\s+)?pinch(?:\s+of)?\s+(.+)$/i);
  if (pinchMatch) {
    return { name: stripFillers(pinchMatch[1]), quantity: 1, unit: "pinch" };
  }

  // "a handful of X" / "handful X"
  const handfulMatch = text.match(/^(?:a\s+)?handful(?:\s+of)?\s+(.+)$/i);
  if (handfulMatch) {
    return { name: stripFillers(handfulMatch[1]), quantity: 1, unit: "handful" };
  }

  // "half X" / "quarter X"
  const halfMatch = text.match(/^(half|quarter)\s+(.+)$/i);
  if (halfMatch) {
    const q = WORD_NUMBERS[halfMatch[1].toLowerCase()];
    const r = extractUnitAndName(halfMatch[2], q);
    return { ...r, name: stripFillers(r.name) };
  }

  // Trailing weight pattern: "chicken 500g", "rice 300 g", "paneer 1.5 lbs"
  // Matches a name followed by a number + unit at the end.
  const trailing = text.match(
    new RegExp(`^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${TRAILING_UNITS})\\.?$`, "i"),
  );
  if (trailing) {
    const name = stripFillers(trailing[1]);
    const qty = parseFloat(trailing[2]);
    const unitRaw = trailing[3].toLowerCase();
    const unit = UNIT_ALIASES[unitRaw] ?? unitRaw;
    if (Number.isFinite(qty) && name) {
      return { name, quantity: qty, unit };
    }
  }

  // Leading quantity + optional unit + name: "2 cups rice", "1.5 lbs chicken",
  // "3 spoons ghee", "2 onions". Also handles attached form: "500g chicken".
  const qtyMatch = text.match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b\s*(.+)$/i,
  );
  if (qtyMatch) {
    const qtyToken = qtyMatch[1];
    const rest = qtyMatch[2];
    const qty = parseQuantity(qtyToken);
    if (qty !== null && rest) {
      const r = extractUnitAndName(rest, qty);
      return { ...r, name: stripFillers(r.name) };
    }
  }

  // Attached-unit leading: "500g chicken"
  const attached = text.match(
    new RegExp(`^(\\d+(?:\\.\\d+)?)(${TRAILING_UNITS})\\s+(.+)$`, "i"),
  );
  if (attached) {
    const qty = parseFloat(attached[1]);
    const unitRaw = attached[2].toLowerCase();
    const unit = UNIT_ALIASES[unitRaw] ?? unitRaw;
    const name = stripFillers(attached[3]);
    if (Number.isFinite(qty) && name) {
      return { name, quantity: qty, unit };
    }
  }

  // No quantity: treat as a pinch for spice-like things, otherwise 1 whole
  const lower = text.toLowerCase();
  const isSpiceLike = /(salt|pepper|turmeric|haldi|cumin|jeera|masala|cinnamon|cardamom|cloves|coriander|dhaniya|oregano|basil|paprika|hing|asafoetida|methi|fenugreek|saffron|amchur|bay leaf|cayenne)/.test(
    lower,
  );
  // Note: "chilli" / "chillies" treated as 1 whole fresh chilli now (see common_ingredients).
  if (isSpiceLike) {
    return { name: stripFillers(text), quantity: 1, unit: "pinch" };
  }
  return { name: stripFillers(text), quantity: 1, unit: "whole" };
}

function extractUnitAndName(
  rest: string,
  quantity: number,
): RawParsed {
  const tokens = rest.trim().split(/\s+/);
  if (tokens.length === 0) return { name: rest.trim(), quantity, unit: "whole" };

  const firstRaw = tokens[0].toLowerCase().replace(/[.,]/g, "");
  const firstAlias = UNIT_ALIASES[firstRaw];
  if (firstAlias) {
    const name = tokens.slice(1).join(" ").trim();
    if (name) return { name, quantity, unit: firstAlias };
  }
  return { name: rest.trim(), quantity, unit: "whole" };
}

export async function parseIngredients(
  rawText: string,
): Promise<ParsedIngredient[]> {
  if (USE_MOCK_API) {
    return mockParse(rawText);
  }
  return claudeParse(rawText);
}

function mockParse(rawText: string): ParsedIngredient[] {
  const phrases = splitIngredientPhrases(rawText);
  const out: ParsedIngredient[] = [];
  for (const p of phrases) {
    const parsed = parsePhraseWithCookingState(p);
    if (parsed && parsed.name) out.push(parsed);
  }
  return out;
}

// Split on commas, newlines, semicolons, and the connecting words
// "and" / "with" when they link two different ingredients.
// "1 1/2 cups rice" must not split — the regex requires whitespace on
// both sides of the word, so embedded occurrences stay intact.
function splitIngredientPhrases(text: string): string[] {
  return text
    .split(/\s*,\s*|\s*;\s*|\s*\n\s*|\s+and\s+|\s+with\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

async function claudeParse(rawText: string): Promise<ParsedIngredient[]> {
  const prompt = `Parse this shopping/cooking list into JSON. Return ONLY a JSON array, no prose.
Each item: {"name": string, "quantity": number, "unit": string}.
Units: cup, tablespoon, teaspoon, lb, oz, g, kg, ml, l, slice, piece, clove, scoop, pinch, handful, medium, small, large, whole.
"a pinch" → quantity 1 unit pinch. "handful" → quantity 1 unit handful. No quantity like "salt" → 1 pinch.

Input: """${rawText}"""`;
  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text =
      data?.content?.[0]?.text ?? data?.content?.[0]?.input?.text ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return mockParse(rawText);
    const parsed = JSON.parse(match[0]) as RawParsed[];
    // Live mode: tag cooking_state from the original phrase context. Live
    // Claude may pre-strip qualifiers, so default by-name when no detection.
    return parsed
      .filter((p) => p && p.name)
      .map((p) => ({
        ...p,
        cooking_state: resolveCookingState(p.name, null),
      }));
  } catch {
    return mockParse(rawText);
  }
}

// ───────────────────────────────────────────────────────────────────
// Unit conversion to grams
// ───────────────────────────────────────────────────────────────────

function unitToGrams(
  quantity: number,
  unit: string,
  common: CommonIngredient | null,
): number {
  const u = unit.toLowerCase();
  switch (u) {
    case "g": return quantity;
    case "kg": return quantity * 1000;
    case "oz": return quantity * 28.3495;
    case "lb": return quantity * 453.592;
    case "ml": return quantity; // 1 ml water ≈ 1 g
    case "l": return quantity * 1000;
    case "cup": return quantity * (common?.typical_unit === "1 cup" || common?.typical_unit.includes("cup") ? common.typical_unit_weight_g : 240);
    case "tablespoon": return quantity * 14;
    case "teaspoon": return quantity * 5;
    case "pinch": return quantity * 0.5;
    case "handful": return quantity * 30;
    case "slice": return quantity * (common?.typical_unit === "1 slice" ? common.typical_unit_weight_g : 28);
    case "clove": return quantity * 3;
    case "scoop": return quantity * 30;
    default:
      // whole / medium / small / large / piece — use common's typical weight if we have it
      if (common) {
        const base = common.typical_unit_weight_g;
        if (u === "small") return quantity * base * 0.75;
        if (u === "large") return quantity * base * 1.3;
        return quantity * base;
      }
      return quantity * 100;
  }
}

// ───────────────────────────────────────────────────────────────────
// Agent 2 - Pantry Lookup (pantry_items + common_ingredients)
// ───────────────────────────────────────────────────────────────────

type LookupResolution = {
  resolved: ResolvedIngredient;
} | null;

function pantryToResolved(
  p: PantryItem,
  parsed: ParsedIngredient,
): ResolvedIngredient {
  const weight_g = unitToGrams(parsed.quantity, parsed.unit, {
    id: 0,
    name: p.name,
    category: "",
    calories_per_100g: p.calories_per_100g,
    protein_per_100g: p.protein_per_100g,
    carbs_per_100g: p.carbs_per_100g,
    fat_per_100g: p.fat_per_100g,
    fiber_per_100g: p.fiber_per_100g ?? 0,
    typical_unit: p.serving_unit ?? "1 serving",
    typical_unit_weight_g: p.serving_size ?? 100,
  });
  const f = weight_g / 100;
  return {
    id: `${parsed.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: parsed.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    assumed_weight_g: weight_g,
    calories: round(p.calories_per_100g * f),
    protein: round(p.protein_per_100g * f),
    carbs: round(p.carbs_per_100g * f),
    fat: round(p.fat_per_100g * f),
    fiber: round((p.fiber_per_100g ?? 0) * f),
    confidence: 95,
    source: "pantry",
    cooking_state: parsed.cooking_state,
    colorCode: "none",
  };
}

function commonToResolved(
  c: CommonIngredient,
  parsed: ParsedIngredient,
): ResolvedIngredient {
  const weight_g = unitToGrams(parsed.quantity, parsed.unit, c);
  const f = weight_g / 100;
  // Reconcile profile form with user's cooking state: e.g. "200g raw rice"
  // against a cooked-keyed profile must multiply by 3 to reflect the
  // higher calorie density of raw rice.
  const macroScale = macroScaleForCookingMismatch(
    parsed.name,
    c.typical_unit,
    parsed.cooking_state,
  );
  return {
    id: `${parsed.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: parsed.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    assumed_weight_g: weight_g,
    calories: round(c.calories_per_100g * f * macroScale),
    protein: round(c.protein_per_100g * f * macroScale),
    carbs: round(c.carbs_per_100g * f * macroScale),
    fat: round(c.fat_per_100g * f * macroScale),
    fiber: round(c.fiber_per_100g * f * macroScale),
    confidence: 90,
    // Built-in common_ingredients hits are NOT user-pantry inventory.
    // Treat them as a cache so the badge and pantry decrement do the
    // right thing.
    source: "cache",
    cooking_state: parsed.cooking_state,
    colorCode: "none",
    category: c.category,
  };
}

async function pantryLookup(parsed: ParsedIngredient): Promise<LookupResolution> {
  // User's personal pantry first
  const matches = await searchPantryItems(parsed.name);
  if (matches.length > 0) {
    const best =
      matches.find(
        (m) => m.name.toLowerCase() === parsed.name.trim().toLowerCase(),
      ) ?? matches[0];
    return { resolved: pantryToResolved(best, parsed) };
  }
  // Fall back to the built-in common ingredients list
  const common = await findCommonIngredientByName(parsed.name);
  if (common) return { resolved: commonToResolved(common, parsed) };
  return null;
}

// ───────────────────────────────────────────────────────────────────
// Agent 3 - Cache Lookup
// ───────────────────────────────────────────────────────────────────

async function cacheLookup(parsed: ParsedIngredient): Promise<LookupResolution> {
  const cached = await findCachedNutrition(parsed.name);
  if (!cached) return null;

  // Cached row is "per 100g". Scale to current quantity/unit. We re-look-up
  // the common_ingredients entry to get the typical_unit string, so cache
  // hits also benefit from raw↔cooked macro reconciliation.
  const common = await findCommonIngredientByName(parsed.name);
  const weight_g = unitToGrams(parsed.quantity, parsed.unit, common);
  const f = weight_g / 100;
  const macroScale = macroScaleForCookingMismatch(
    parsed.name,
    common?.typical_unit,
    parsed.cooking_state,
  );

  return {
    resolved: {
      id: `${parsed.name}-${Math.random().toString(36).slice(2, 8)}`,
      name: parsed.name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      assumed_weight_g: weight_g,
      calories: round(cached.calories * f * macroScale),
      protein: round(cached.protein * f * macroScale),
      carbs: round(cached.carbs * f * macroScale),
      fat: round(cached.fat * f * macroScale),
      fiber: round((cached.fiber ?? 0) * f * macroScale),
      confidence: cached.confidence,
      source: "cache",
      cooking_state: parsed.cooking_state,
      colorCode: "none",
    },
  };
}

// ───────────────────────────────────────────────────────────────────
// Agent 4 - Open Food Facts API Lookup
// ───────────────────────────────────────────────────────────────────

async function apiLookup(parsed: ParsedIngredient): Promise<LookupResolution> {
  try {
    const url = OPEN_FOOD_FACTS_URL.replace(
      "INGREDIENT",
      encodeURIComponent(parsed.name),
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
    const carbs_per_100g = Number(
      n.carbohydrates_100g ?? n.carbohydrates ?? 0,
    );
    const fat_per_100g = Number(n.fat_100g ?? n.fat ?? 0);
    const fiber_per_100g = Number(n.fiber_100g ?? n.fiber ?? 0);
    if (calories_per_100g === 0 && protein_per_100g === 0 && fat_per_100g === 0) {
      return null;
    }

    await saveCachedNutrition({
      ingredient_name: parsed.name,
      calories: calories_per_100g,
      protein: protein_per_100g,
      carbs: carbs_per_100g,
      fat: fat_per_100g,
      fiber: fiber_per_100g,
      confidence: 85,
      source: "open_food_facts",
    });

    const common = await findCommonIngredientByName(parsed.name);
    const weight_g = unitToGrams(parsed.quantity, parsed.unit, common);
    const f = weight_g / 100;
    return {
      resolved: {
        id: `${parsed.name}-${Math.random().toString(36).slice(2, 8)}`,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        assumed_weight_g: weight_g,
        calories: round(calories_per_100g * f),
        protein: round(protein_per_100g * f),
        carbs: round(carbs_per_100g * f),
        fat: round(fat_per_100g * f),
        fiber: round(fiber_per_100g * f),
        confidence: 85,
        source: "open_food_facts",
        cooking_state: parsed.cooking_state,
        colorCode: "none",
      },
    };
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────
// Agent 5 - AI Estimation (mock returns from seed defaults)
// ───────────────────────────────────────────────────────────────────

type MockDefault = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight_g: number;
  unit: string;
};

const MOCK_DEFAULTS: Record<string, MockDefault> = {
  egg: { calories: 72, protein: 6, carbs: 0.4, fat: 5, weight_g: 50, unit: "whole" },
  rice: { calories: 206, protein: 4, carbs: 45, fat: 0.4, weight_g: 186, unit: "cup" },
  chicken: { calories: 165, protein: 31, carbs: 0, fat: 3.6, weight_g: 100, unit: "g" },
  onion: { calories: 44, protein: 1, carbs: 10, fat: 0, weight_g: 110, unit: "medium" },
  tomato: { calories: 22, protein: 1, carbs: 5, fat: 0, weight_g: 150, unit: "medium" },
  ghee: { calories: 120, protein: 0, carbs: 0, fat: 14, weight_g: 14, unit: "tablespoon" },
  oil: { calories: 120, protein: 0, carbs: 0, fat: 14, weight_g: 14, unit: "tablespoon" },
  banana: { calories: 105, protein: 1, carbs: 27, fat: 0.4, weight_g: 118, unit: "medium" },
  milk: { calories: 149, protein: 8, carbs: 12, fat: 8, weight_g: 244, unit: "cup" },
  sugar: { calories: 49, protein: 0, carbs: 13, fat: 0, weight_g: 12, unit: "tablespoon" },
  "toor dal": { calories: 198, protein: 13, carbs: 36, fat: 1, weight_g: 200, unit: "cup" },
  paneer: { calories: 265, protein: 18, carbs: 1, fat: 21, weight_g: 100, unit: "g" },
  dahi: { calories: 98, protein: 11, carbs: 4, fat: 4.3, weight_g: 244, unit: "cup" },
  yogurt: { calories: 98, protein: 11, carbs: 4, fat: 4.3, weight_g: 244, unit: "cup" },
  atta: { calories: 340, protein: 14, carbs: 72, fat: 2, weight_g: 120, unit: "cup" },
  "wheat flour": { calories: 340, protein: 14, carbs: 72, fat: 2, weight_g: 120, unit: "cup" },
};

function mockEstimate(parsed: ParsedIngredient): ResolvedIngredient {
  const lower = parsed.name.toLowerCase().trim();
  let def: MockDefault | null = null;
  for (const key of Object.keys(MOCK_DEFAULTS)) {
    if (lower === key || lower.includes(key)) {
      def = MOCK_DEFAULTS[key];
      break;
    }
  }
  if (!def) {
    def = { calories: 50, protein: 2, carbs: 8, fat: 1, weight_g: 100, unit: "g" };
  }
  // Default weights are per def.weight_g for 1 of def.unit. Scale by quantity.
  const scale = parsed.quantity;
  return {
    id: `${parsed.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: parsed.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    assumed_weight_g: round(def.weight_g * scale),
    calories: round(def.calories * scale),
    protein: round(def.protein * scale),
    carbs: round(def.carbs * scale),
    fat: round(def.fat * scale),
    fiber: 0,
    confidence: 70,
    source: "ai_estimate",
    cooking_state: parsed.cooking_state,
    colorCode: "none",
  };
}

async function aiEstimate(parsed: ParsedIngredient): Promise<ResolvedIngredient> {
  if (USE_MOCK_API) {
    const r = mockEstimate(parsed);
    // Persist to cache so next time it's a cache hit
    const f = r.assumed_weight_g > 0 ? 100 / r.assumed_weight_g : 1;
    await saveCachedNutrition({
      ingredient_name: parsed.name,
      calories: r.calories * f,
      protein: r.protein * f,
      carbs: r.carbs * f,
      fat: r.fat * f,
      fiber: 0,
      confidence: 70,
      source: "ai_estimate",
    });
    return r;
  }
  return claudeEstimate(parsed);
}

async function claudeEstimate(
  parsed: ParsedIngredient,
): Promise<ResolvedIngredient> {
  const prompt = `Estimate nutrition for ONE ingredient. Return ONLY JSON, no prose.
Schema: {"assumed_weight_g": number, "calories": number, "protein": number, "carbs": number, "fat": number, "fiber": number}
Numbers reflect the total for the given quantity and unit.

Ingredient: ${JSON.stringify(parsed)}`;
  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "{}";
    const match = text.match(/\{[\s\S]*\}/);
    const parsedJson = match ? JSON.parse(match[0]) : {};
    const r: ResolvedIngredient = {
      id: `${parsed.name}-${Math.random().toString(36).slice(2, 8)}`,
      name: parsed.name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      assumed_weight_g: round(Number(parsedJson.assumed_weight_g ?? 100)),
      calories: round(Number(parsedJson.calories ?? 50)),
      protein: round(Number(parsedJson.protein ?? 2)),
      carbs: round(Number(parsedJson.carbs ?? 8)),
      fat: round(Number(parsedJson.fat ?? 1)),
      fiber: round(Number(parsedJson.fiber ?? 0)),
      confidence: 70,
      source: "ai_estimate",
      cooking_state: parsed.cooking_state,
      colorCode: "none",
    };
    const f = r.assumed_weight_g > 0 ? 100 / r.assumed_weight_g : 1;
    await saveCachedNutrition({
      ingredient_name: parsed.name,
      calories: r.calories * f,
      protein: r.protein * f,
      carbs: r.carbs * f,
      fat: r.fat * f,
      fiber: r.fiber * f,
      confidence: 70,
      source: "ai_estimate",
    });
    return r;
  } catch {
    return mockEstimate(parsed);
  }
}

// ───────────────────────────────────────────────────────────────────
// Agent 6 - Aggregation & Validation
// ───────────────────────────────────────────────────────────────────

const VEG_FRUIT_CATS = new Set(["vegetable", "fruit"]);
const SPICE_CAT = "spice";
const OIL_LIKE = new Set(["ghee", "butter", "oil", "olive oil", "coconut oil", "peanut butter", "almond butter"]);

async function validateAndAdjust(
  ingredients: ResolvedIngredient[],
): Promise<{ items: ResolvedIngredient[]; warnings: string[] }> {
  const warnings: string[] = [];
  const out: ResolvedIngredient[] = [];

  for (const ing of ingredients) {
    const perUnitCal = ing.quantity > 0 ? ing.calories / ing.quantity : ing.calories;
    let flagged = false;
    let reason = "";

    if (
      ing.category &&
      VEG_FRUIT_CATS.has(ing.category) &&
      perUnitCal > 100
    ) {
      flagged = true;
      reason = "Suspicious calories for a vegetable/fruit";
    }
    const lowerName = ing.name.toLowerCase();
    const isOilLike = [...OIL_LIKE].some((o) => lowerName.includes(o));
    if (
      ing.category === SPICE_CAT &&
      ing.unit === "tablespoon" &&
      ing.calories > 50 &&
      !isOilLike
    ) {
      flagged = true;
      reason = "Suspicious calories for a spice per spoon";
    }
    if (
      ing.calories === 0 &&
      ing.source !== "pantry" &&
      ing.name.toLowerCase() !== "salt" &&
      ing.name.toLowerCase() !== "water"
    ) {
      flagged = true;
      reason = "Zero calories flagged";
    }

    if (flagged) {
      warnings.push(`${ing.name}: ${reason}`);
      if (USE_MOCK_API) {
        const common = await findCommonIngredientByName(ing.name);
        if (common) {
          const weight_g = unitToGrams(ing.quantity, ing.unit, common);
          const f = weight_g / 100;
          out.push({
            ...ing,
            assumed_weight_g: round(weight_g),
            calories: round(common.calories_per_100g * f),
            protein: round(common.protein_per_100g * f),
            carbs: round(common.carbs_per_100g * f),
            fat: round(common.fat_per_100g * f),
            fiber: round(common.fiber_per_100g * f),
            flagged: true,
            flagReason: reason,
            category: common.category,
          });
          continue;
        }
      } else {
        const re = await claudeEstimate({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          cooking_state: ing.cooking_state,
        });
        out.push({ ...re, flagged: true, flagReason: reason });
        continue;
      }
      out.push({ ...ing, flagged: true, flagReason: reason });
    } else {
      out.push(ing);
    }
  }

  return { items: out, warnings };
}

function colorCodeOf(ing: ResolvedIngredient): ColorCode {
  if (ing.category === SPICE_CAT && ing.calories < 10) return "gray";
  if (ing.calories > 200) return "red";
  if (ing.calories >= 50 && ing.calories <= 200) return "yellow";
  return "none";
}

function groupSpices(ingredients: ResolvedIngredient[]): DisplayItem[] {
  const lowCalSpices: ResolvedIngredient[] = [];
  const rest: ResolvedIngredient[] = [];
  for (const ing of ingredients) {
    if (ing.category === SPICE_CAT && ing.calories < 10) {
      lowCalSpices.push(ing);
    } else {
      rest.push(ing);
    }
  }
  const items: DisplayItem[] = rest.map((ing) => ({ kind: "ingredient", ...ing }));
  if (lowCalSpices.length >= 2) {
    items.push({
      kind: "spiceGroup",
      id: `spice-group-${Math.random().toString(36).slice(2, 8)}`,
      names: lowCalSpices.map((s) => s.name),
      calories: round(lowCalSpices.reduce((s, x) => s + x.calories, 0)),
      protein: round(lowCalSpices.reduce((s, x) => s + x.protein, 0)),
      carbs: round(lowCalSpices.reduce((s, x) => s + x.carbs, 0)),
      fat: round(lowCalSpices.reduce((s, x) => s + x.fat, 0)),
    });
  } else {
    for (const s of lowCalSpices) items.push({ kind: "ingredient", ...s });
  }
  return items;
}

function round(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

// ───────────────────────────────────────────────────────────────────
// Orchestrator
// ───────────────────────────────────────────────────────────────────

export async function runNutritionPipeline(
  rawText: string,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const { onStep } = opts;
  if (!rawText || !rawText.trim()) {
    throw new Error("Enter at least one ingredient");
  }

  onStep?.("parsing");
  const parsed = await parseIngredients(rawText);
  if (parsed.length === 0) {
    throw new Error("Enter at least one ingredient");
  }

  onStep?.("pantry");
  const afterPantry: ResolvedIngredient[] = [];
  const remainingAfterPantry: ParsedIngredient[] = [];
  for (const p of parsed) {
    const r = await pantryLookup(p);
    if (r) afterPantry.push(r.resolved);
    else remainingAfterPantry.push(p);
  }

  onStep?.("cache");
  const afterCache: ResolvedIngredient[] = [];
  const remainingAfterCache: ParsedIngredient[] = [];
  for (const p of remainingAfterPantry) {
    const r = await cacheLookup(p);
    if (r) afterCache.push(r.resolved);
    else remainingAfterCache.push(p);
  }

  onStep?.("api");
  const afterApi: ResolvedIngredient[] = [];
  const remainingAfterApi: ParsedIngredient[] = [];
  if (USE_MOCK_API) {
    // In mock mode we skip the network round-trip entirely.
    remainingAfterApi.push(...remainingAfterCache);
  } else {
    for (const p of remainingAfterCache) {
      const r = await apiLookup(p);
      if (r) afterApi.push(r.resolved);
      else remainingAfterApi.push(p);
    }
  }

  onStep?.("ai");
  const afterAi: ResolvedIngredient[] = [];
  for (const p of remainingAfterApi) {
    const r = await aiEstimate(p);
    afterAi.push(r);
  }

  onStep?.("aggregating");
  const combined: ResolvedIngredient[] = [
    ...afterPantry,
    ...afterCache,
    ...afterApi,
    ...afterAi,
  ];

  // Tag categories we can look up (for color coding + validation)
  for (const ing of combined) {
    if (!ing.category) {
      const common = await findCommonIngredientByName(ing.name);
      if (common) ing.category = common.category;
    }
  }

  const { items: validated, warnings } = await validateAndAdjust(combined);
  for (const v of validated) v.colorCode = colorCodeOf(v);

  const subtotal = validated.reduce(
    (acc, x) => ({
      calories: acc.calories + x.calories,
      protein: acc.protein + x.protein,
      carbs: acc.carbs + x.carbs,
      fat: acc.fat + x.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  if (subtotal.calories > 5000) {
    warnings.push("Dish exceeds 5000 cal — please double-check quantities");
  }

  const items = groupSpices(validated);

  onStep?.("done");
  return {
    items,
    rawIngredients: validated,
    subtotal: {
      calories: round(subtotal.calories),
      protein: round(subtotal.protein),
      carbs: round(subtotal.carbs),
      fat: round(subtotal.fat),
    },
    warnings,
  };
}

// ───────────────────────────────────────────────────────────────────
// Photo portion estimation (mock stub)
// ───────────────────────────────────────────────────────────────────

export async function estimatePortionFromPhoto(
  _photoUri: string,
): Promise<{ text: string }> {
  if (USE_MOCK_API) {
    return {
      text: "1 cup rice, 100g chicken, 2 tablespoons oil",
    };
  }
  // LIVE mode would upload the image to Claude Vision here.
  return { text: "" };
}
