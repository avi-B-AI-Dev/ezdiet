/**
 * Cooking state — raw vs cooked vs irrelevant — and the conversion ratio
 * table that lets us reconcile pantry inventory (purchased = raw form) with
 * what users actually log (typically the cooked form).
 *
 * Pantry is the source of truth for inventory and is always stored in raw
 * weight. The pipeline tags every ingredient with one of:
 *   'raw'        — pre-cooking weight/volume (dry rice, dry pasta, ...)
 *   'cooked'     — post-cooking weight/volume (1 cup cooked rice, ...)
 *   'irrelevant' — items where it doesn't matter (eggs, milk, salt, fruit)
 *
 * To decrement the pantry from a cooked log, divide the parsed grams by the
 * convertible item's COOKED_RATIOS multiplier (raw × ratio = cooked).
 */

export type CookingState = "raw" | "cooked" | "irrelevant";

// raw × ratio = cooked. Keys are name fragments that appear inside the
// resolved ingredient name (case-insensitive substring match).
const COOKED_RATIOS: { match: string; ratio: number }[] = [
  // Grains
  { match: "basmati rice", ratio: 3 },
  { match: "brown rice", ratio: 3 },
  { match: "white rice", ratio: 3 },
  { match: "idli rice", ratio: 3 },
  { match: "rice", ratio: 3 },
  { match: "quinoa", ratio: 3 },
  { match: "barley", ratio: 3 },
  // Pulses / lentils / dals (raw → cooked roughly 2.5×)
  { match: "toor dal", ratio: 2.5 },
  { match: "chana dal", ratio: 2.5 },
  { match: "moong dal", ratio: 2.5 },
  { match: "urad dal", ratio: 2.5 },
  { match: "masoor dal", ratio: 2.5 },
  { match: "dal", ratio: 2.5 },
  { match: "lentil", ratio: 2.5 },
  { match: "lentils", ratio: 2.5 },
  // Beans (rajma, kidney, chickpea, black, etc.)
  { match: "rajma", ratio: 2.5 },
  { match: "kidney bean", ratio: 2.5 },
  { match: "chickpea", ratio: 2.5 },
  { match: "chana", ratio: 2.5 },
  { match: "black bean", ratio: 2.5 },
  { match: "bean", ratio: 2.5 },
  // Pasta
  { match: "pasta", ratio: 2 },
  { match: "spaghetti", ratio: 2 },
  { match: "macaroni", ratio: 2 },
  { match: "penne", ratio: 2 },
  // Oats
  { match: "oats", ratio: 2.5 },
  { match: "rolled oats", ratio: 2.5 },
  { match: "oat", ratio: 2.5 },
  // Vermicelli / seviyan
  { match: "vermicelli", ratio: 2 },
  { match: "seviyan", ratio: 2 },
];

const DEFAULT_CONVERTIBLE_RATIO = 2.5;

// Returns the raw→cooked ratio for an item, or null if it is not a
// convertible category (in which case its cooking_state is 'irrelevant').
export function getCookingRatio(name: string): number | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const { match, ratio } of COOKED_RATIOS) {
    if (n.includes(match)) return ratio;
  }
  return null;
}

// True if the item is in the convertible set — rice, dal, pasta, etc.
export function isConvertible(name: string): boolean {
  return getCookingRatio(name) != null;
}

// Default cooking state when the user types no qualifier:
//   - convertible items → 'cooked' (most users log what they ate)
//   - everything else  → 'irrelevant'
export function defaultCookingState(name: string): CookingState {
  return isConvertible(name) ? "cooked" : "irrelevant";
}

// Convert grams from one cooking state to another for the same ingredient.
// Returns null if the conversion isn't applicable (irrelevant items, or
// raw↔cooked on a non-convertible name).
export function convertGrams(
  grams: number,
  from: CookingState,
  to: CookingState,
  name: string,
): number | null {
  if (from === to) return grams;
  if (from === "irrelevant" || to === "irrelevant") return null;
  const ratio = getCookingRatio(name) ?? DEFAULT_CONVERTIBLE_RATIO;
  if (from === "cooked" && to === "raw") return grams / ratio;
  if (from === "raw" && to === "cooked") return grams * ratio;
  return null;
}

// ───────────────────────────────────────────────────────────────────
// Parser helper — strip cooking-state qualifiers from raw text.
// ───────────────────────────────────────────────────────────────────

// Words that appear before/after the ingredient and unambiguously fix the
// cooking state. Matched as whole tokens so "raviolini" doesn't trigger raw.
const RAW_TOKENS = /\b(raw|dry|uncooked|dried)\b/i;
const COOKED_TOKENS = /\b(cooked|boiled|steamed)\b/i;

export type CookingStateDetection = {
  cleanedName: string;
  detected: CookingState | null; // null if no qualifier — caller fills in default
};

export function detectCookingState(name: string): CookingStateDetection {
  let cleanedName = name;
  let detected: CookingState | null = null;
  if (RAW_TOKENS.test(cleanedName)) {
    detected = "raw";
    cleanedName = cleanedName.replace(RAW_TOKENS, "");
  } else if (COOKED_TOKENS.test(cleanedName)) {
    detected = "cooked";
    cleanedName = cleanedName.replace(COOKED_TOKENS, "");
  }
  cleanedName = cleanedName.replace(/\s+/g, " ").trim();
  return { cleanedName, detected };
}

// Resolve cleaned-name + detected qualifier → final cooking state.
// Honours an explicit qualifier; otherwise applies the default rule above.
export function resolveCookingState(
  cleanedName: string,
  detected: CookingState | null,
): CookingState {
  if (detected) {
    // Sanity: don't tag a non-convertible item as raw/cooked.
    if (!isConvertible(cleanedName)) return "irrelevant";
    return detected;
  }
  return defaultCookingState(cleanedName);
}

// ───────────────────────────────────────────────────────────────────
// Runtime invariant — catches regressions of the BUG A class loudly
// during development. Does nothing in release builds, so it can't
// surprise end users.
// ───────────────────────────────────────────────────────────────────

// 1 kg raw basmati rice expanded ~3× yields 3000g cooked. With ~163g per
// cooked cup, that's ≈ 18.4 cooked-cup servings. The acceptable band is
// 5–20 — well outside it means the unit math has regressed.
export function computeServingsPerKgRice(
  packageSizeKg: number,
  cookedGramsPerServing: number,
  cookedRatio: number,
): number {
  return (packageSizeKg * 1000 * cookedRatio) / cookedGramsPerServing;
}

export function assertPantryMathInvariants(): void {
  if (!__DEV__) return;
  const servings = computeServingsPerKgRice(1, 163, 3);
  if (servings < 5 || servings > 20) {
    throw new Error(
      `Pantry math regression: 1kg basmati rice yields ${servings.toFixed(2)} ` +
        `cooked-cup servings (expected 5..20). Check cooking ratio and ` +
        `serving-size units.`,
    );
  }
}

