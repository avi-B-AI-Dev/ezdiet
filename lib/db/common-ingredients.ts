import { getDatabase } from "./client";

export type CommonIngredient = {
  id: number;
  name: string;
  category: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number;
  typical_unit: string;
  typical_unit_weight_g: number;
};

// English plural stems. "tomatoes" → ["tomatos", "tomato", "tomatoe"], etc.
function stemVariants(s: string): string[] {
  const out: string[] = [];
  if (s.endsWith("ies") && s.length > 4) out.push(s.slice(0, -3) + "y");
  if (s.endsWith("es") && s.length > 3) out.push(s.slice(0, -2));
  if (s.endsWith("s") && s.length > 2) out.push(s.slice(0, -1));
  return out;
}

export async function findCommonIngredientByName(
  name: string,
): Promise<CommonIngredient | null> {
  const db = await getDatabase();
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  // 1) Exact match (including plural-stemmed variants of the query)
  for (const candidate of [normalized, ...stemVariants(normalized)]) {
    const hit = await db.getFirstAsync<CommonIngredient>(
      "SELECT * FROM common_ingredients WHERE lower(name) = ? LIMIT 1",
      candidate,
    );
    if (hit) return hit;
  }

  // 2) Reverse-substring: find stored name that appears as a substring
  // of the user's query. "green chillies" contains "green chilli";
  // "tomatoes" contains "tomato". Prefer the longest/most-specific match.
  const reverse = await db.getFirstAsync<CommonIngredient>(
    `SELECT * FROM common_ingredients
     WHERE ? LIKE '%' || lower(name) || '%'
     ORDER BY length(name) DESC
     LIMIT 1`,
    normalized,
  );
  if (reverse) return reverse;

  // 3) Forward-substring: query is a substring of a stored name
  // ("chicken" → "chicken breast"). Prefer shortest stored name.
  const forward = await db.getFirstAsync<CommonIngredient>(
    "SELECT * FROM common_ingredients WHERE lower(name) LIKE ? ORDER BY length(name) ASC LIMIT 1",
    `%${normalized}%`,
  );
  if (forward) return forward;

  // 4) Token search as a last resort (handles phrases like "with sauce")
  const tokens = normalized.split(/\s+/).filter((t) => t.length >= 3);
  for (const token of tokens) {
    for (const variant of [token, ...stemVariants(token)]) {
      const match = await db.getFirstAsync<CommonIngredient>(
        "SELECT * FROM common_ingredients WHERE lower(name) LIKE ? ORDER BY length(name) ASC LIMIT 1",
        `%${variant}%`,
      );
      if (match) return match;
    }
  }
  return null;
}
