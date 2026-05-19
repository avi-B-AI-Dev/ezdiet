# EzDiet

AI-powered nutrition tracking with a smart pantry that knows what you actually have at home.

![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite)
![Claude API](https://img.shields.io/badge/Claude%20API-Opus%204.7-D97757)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)

## What makes this different

- **6-agent nutrition pipeline.** Free-text ingredients flow through Parser → Pantry → Cache → Open Food Facts → AI Estimation → Validation. Each agent only handles what the previous one couldn't resolve, so most ingredients never reach the AI.
- **Grocery-first pantry.** Pantry inventory is stored in raw/purchased form (you buy 1 kg basmati, not "5 servings of rice"), and meal logs decrement it automatically using a raw↔cooked conversion table.
- **Cooked/raw aware.** The parser detects qualifiers like "raw", "dry", "cooked", "boiled" and reconciles them against per-100g nutrition profiles so "200 g raw rice" and "200 g cooked rice" produce different calorie totals.
- **Mock-first development.** A single `USE_MOCK_API` constant swaps every Claude/vision call for a deterministic local mock, so the full app — parsing, photo scan, label OCR, AI estimation — works end-to-end with zero API spend.

## Architecture

### The 6-agent pipeline

Defined in `lib/nutritionPipeline.ts`. Each ingredient is parsed once and then resolved by the first agent that can satisfy it.

```
raw text
   │
   ▼
[1] Parser              → ParsedIngredient[]      {name, quantity, unit, cooking_state}
   │
   ▼
[2] Pantry Lookup       → checks user's pantry_items, then built-in common_ingredients
   │   (unresolved fall through)
   ▼
[3] Cache Lookup        → checks nutrition_cache (prior OFF / AI results)
   │
   ▼
[4] Open Food Facts     → live HTTP call; result is written back to cache
   │
   ▼
[5] AI Estimation       → Claude Opus (live) or seeded mock defaults; result cached
   │
   ▼
[6] Validation + Aggregation
       · flags suspicious calories per category (veg/fruit > 100 cal, spice > 50 cal/tbsp, etc.)
       · re-resolves flagged rows against the common_ingredients table
       · color-codes ingredients (red > 200, yellow 50–200, gray for tiny spice rows)
       · groups ≥2 low-cal spices into a single "Spices" row
       · raises a warning if total exceeds 5000 cal
```

| Agent | Live (USE_MOCK_API = false) | Mock (default) |
| --- | --- | --- |
| 1. Parser | Claude Opus prompt (falls back to local regex on error) | Local regex parser with fraction/word-number/cooking-state handling |
| 2. Pantry Lookup | Real SQLite (`pantry_items` + `common_ingredients`) | Real SQLite — same code path |
| 3. Cache Lookup | Real SQLite (`nutrition_cache`) | Real SQLite — same code path |
| 4. Open Food Facts | Real HTTPS request to `world.openfoodfacts.org` | Skipped entirely |
| 5. AI Estimation | Claude Opus prompt; results written to cache | Seeded `MOCK_DEFAULTS` table (egg, rice, chicken, ghee, paneer, etc.); cached |
| 6. Validation | Real; reflag path re-asks Claude on flagged rows | Real; reflag path uses `common_ingredients` instead |

The same `USE_MOCK_API` flag also gates the vision stubs in `lib/pantryHaul.ts` (group-photo detection, single-item ID, nutrition-label OCR).

### Data model

Single-user, local SQLite. Schema, idempotent migrations, and seeding all live in `lib/db/client.ts`.

| Table | Purpose |
| --- | --- |
| `users` | Profile + targets + diet style + macro split + water settings (single row) |
| `pantry_items` | Inventory rows with per-100g macros, package size, remaining quantity. `UNIQUE(name, brand)` for dedupe |
| `meals` + `meal_ingredients` | Logged meals; ingredients optionally link back to a dish and a pantry item |
| `dishes` | Per-dish breakdown of a meal with `servings_made` / `servings_eaten` / `servings_remaining` for leftover tracking |
| `saved_recipes` + `recipe_ingredients` | Reusable recipes built from a logged dish |
| `nutrition_cache` | Per-100g cache populated by Open Food Facts and AI Estimation agents |
| `common_ingredients` | Seeded reference DB (re-upserted on every boot from `common-ingredients-seed.ts`) |
| `supplements` + `supplement_log` | Supplement catalog with frequency/time-of-day + per-occurrence log |
| `water_log` | Per-entry water in ml (UI converts to glasses/oz/liters on display) |

WAL mode is on, foreign keys are enforced, and a boot-time invariant (`assertPantryMathInvariants`) throws in dev if the cooking-ratio math regresses.

## Features

### Onboarding (`app/onboarding.tsx`)
7-step flow: basic info → height/weight → goal weight → activity → diet style → composition goal & macro split → supplements & household. Computes BMR (Mifflin–St Jeor), TDEE, daily calorie target with floor protection, and macros from the chosen diet style (balanced / high-protein / keto / low-carb / custom). Flags unsafe weekly weight-loss rates and recommends a timeline.

### Dashboard (`app/(tabs)/dashboard.tsx`)
Time-aware greeting, consecutive-day streak, calorie ring, protein/carbs/fat bars, four meal slots (breakfast / lunch / dinner / snacks), water card with tap-to-cycle units (glasses / oz / liters) and a custom-amount modal, and a "due today" supplements list with toggle/dismiss.

### Meal logger (`app/meal-log.tsx`)
- Multi-dish per meal — add as many dishes as you ate, each with its own ingredient list.
- Free-text ingredient parsing (`"1 cup rice, 2 eggs and a bit of ghee"`), including fractions, word numbers, trailing-weight ("chicken 500g"), and filler-word stripping.
- Cooked/raw detection ("200g raw rice" vs "1 cup cooked rice") with raw↔cooked macro reconciliation.
- Per-step progress UI driven by the pipeline's `onStep` callback (Parsing → Pantry → Cache → API → AI → Aggregating → Done).
- Source badges per ingredient: Pantry / Cache / Open Food Facts / AI Estimate, plus flagged-with-reason markers.
- Spice grouping — two or more low-cal spice rows are collapsed into a single "Spices" line.
- "Save as recipe" — turn any dish into a reusable recipe.
- Your-share servings: enter `servings_made` and `servings_eaten` so leftovers stay in the dishes table and the dashboard can offer them later.
- Photo portion estimation (mock stub today — returns a fixed ingredient list).
- Edit-mode rehydrates an existing meal from `meals` + `dishes` + `meal_ingredients`.

### Pantry (`app/(tabs)/pantry.tsx`, `app/pantry-add.tsx`, `app/pantry-item.tsx`)
- Three add methods on `/pantry-add`: **group photo** (multi-item haul, vision-detected list with checkboxes), **single item** (front-of-package photo → fall through to nutrition-label flow), **type it** (name + qty + unit, resolved against common ingredients).
- Search across name + brand.
- Filter pills: All / Packaged / Fresh / Low Stock (low-stock = remaining < 20% of purchased).
- Item detail view with full macros, remaining quantity, and category.
- Automatic decrement on meal log — `consumeFromPantry` reduces `quantity_remaining` based on grams consumed and the item's package unit (weight units vs. count units).
- Pantry source labels: `label_verified`, `api_lookup`, `ai_estimated`, `common_db` (plus legacy `scanned` / `manual`).
- "Clear all pantry items" from the profile danger zone.

### Profile (`app/(tabs)/profile.tsx`)
Full edit surface for every onboarding answer — name, age, gender, height, weight, goal, timeframe, activity, composition, diet style, custom macro split — plus editable daily targets with a one-tap "recalculate from plan" button, water settings, supplements CRUD, and a danger zone (clear pantry, reset database).

## Roadmap

### Next up
- Weekly trends (visualize calorie + macro patterns over time)
- Demo video walkthrough
- UI polish pass (current UI is functional; design refresh planned at end of feature work)

### Future considerations
- Barcode scanner path for packaged groceries (Open Food Facts integration is built; barcode scanner UI not yet)
- Ingredient cache persistence across sessions
- BYOK (bring your own key) for Claude API when scaling beyond single-user
- Recurring/favorite meals for one-tap re-logging
- Recipe library (save as recipe is built; full recipe browsing screen planned)
- Real Claude API integration (currently runs in mock mode for cost-free development; switching to live requires only an env flag change)

### Known limitations
- Raw vs cooked nutrition conversion uses fixed ratios per food family; doesn't account for variations like brown vs white rice
- Pantry add by camera works only for clear single-item photos; group photo scan is more error-prone
- No multi-user / cloud sync — single-device, single-user by design for MVP

## Setup

### Prerequisites
- Node.js 20+
- npm 10+ (or pnpm/yarn)
- iOS Simulator (Xcode) or Android Emulator, **or** the Expo Go app on a physical device

### Install and run

```bash
git clone <repo-url>
cd EzDiet
npm install
npm start
```

Then scan the QR code with Expo Go, or press `i` / `a` in the Metro terminal to launch a simulator.

### Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` | Start with the iOS simulator |
| `npm run android` | Start with the Android emulator |
| `npm run web` | Start the web target |
| `npm run lint` | Run Expo's ESLint config |

### Reset local data
Profile tab → bottom of screen → **Reset all app data**. This deletes the SQLite database and routes back to onboarding.

## Mock vs Live mode

The mock/live switch is a single constant in `lib/nutritionPipeline.ts`:

```ts
export const USE_MOCK_API = true; // default — fully functional, no API cost
const CLAUDE_API_KEY = "";        // fill in to go live
```

In **mock mode** (default):
- Parser, AI Estimation, vision (group photo / single item / nutrition label) all return deterministic local data.
- Pantry, cache, and validation hit the real SQLite database.
- Open Food Facts is skipped.
- The app is fully usable — full meal log flow, pantry add, leftovers, recipes — without an internet connection or API key.

In **live mode**:
- Set `USE_MOCK_API = false` and add a Claude API key in the same file.
- Parser and AI Estimation hit Claude Opus.
- Open Food Facts is queried for unresolved ingredients before falling through to AI Estimation.
- Vision stubs (group/single/label) currently return the mock values even with the flag flipped — a real Claude Vision integration is planned but not wired up yet.

## Tech stack

| Concern | Choice |
| --- | --- |
| Runtime | Expo SDK 54, React Native 0.81, React 19 (new architecture on, React Compiler on) |
| Language | TypeScript 5.9 |
| Routing | Expo Router 6 (file-based, typed routes) |
| Storage | `expo-sqlite` (WAL, foreign keys, idempotent migrations) |
| State | React state + AsyncStorage for theme |
| Charts / graphics | `react-native-svg`, `react-native-chart-kit` |
| Gestures / animation | `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets` |
| Camera / images | `expo-camera`, `expo-image-picker`, `expo-image` |
| AI | Claude Opus 4.7 via `https://api.anthropic.com/v1/messages` (mocked by default) |
| External data | Open Food Facts public search API |
| Icons | `@expo/vector-icons` (Ionicons) |
| Pickers | `@react-native-community/datetimepicker` |

## Project structure

```
app/
  _layout.tsx                # Root stack; initDatabase()
  index.tsx                  # Boot router → onboarding or dashboard
  onboarding.tsx             # 7-step onboarding
  meal-log.tsx               # Meal logger (multi-dish, agents, leftovers, save-as-recipe)
  pantry-add.tsx             # Group photo / single item / type-it haul intake
  pantry-item.tsx            # Pantry item detail
  (tabs)/
    _layout.tsx              # Home / Log Meal / Pantry / Profile
    dashboard.tsx
    log.tsx                  # Meal-type chooser → /meal-log
    pantry.tsx
    profile.tsx
components/
  CalorieRing.tsx  MacroBar.tsx  MealSlot.tsx
  QuickAddModal.tsx  WaterAddModal.tsx  WaterCard.tsx
  InitialsAvatar.tsx
lib/
  nutritionPipeline.ts       # 6-agent pipeline + USE_MOCK_API flag
  pantryHaul.ts              # Pantry intake resolver + vision mocks
  cookingState.ts            # raw/cooked detection, conversion ratios, invariants
  nutrition.ts               # BMR/TDEE/macro math, diet styles, unit conversions
  date.ts  streak.ts  theme.ts  water-units.ts
  db/
    client.ts                # Schema, migrations, seeding
    users.ts  pantry.ts  meals.ts  dishes.ts
    recipes.ts  supplements.ts  water.ts
    nutrition-cache.ts  common-ingredients.ts
    common-ingredients-seed.ts  pantry-seed.ts
    index.ts                 # Barrel export
```

## Status

Portfolio-ready, actively developed. Day 1–3 milestones (onboarding, dashboard, agentic meal logging with pantry integration) are complete. Currently runs in mock mode by default; the live Claude path is wired and structurally identical, awaiting a real API key for evaluation. See the Roadmap above for what's next and what's intentionally out of scope for the MVP.

---

### Notes from this README pass

A few things I noticed in the codebase while updating the README — not blockers, but worth flagging:

- `package.json` defines a `reset-project` script pointing at `./scripts/reset-project.js`, but there is no `scripts/` directory. The script will fail if invoked. The in-app "Reset all app data" button on the Profile screen is the working path.
- The mock/live switch is a `const` in `lib/nutritionPipeline.ts`, not an environment variable. Going live currently requires editing the source file (flipping `USE_MOCK_API` and pasting a key into `CLAUDE_API_KEY`). The roadmap line about "only an env flag change" describes the intent, not the current implementation.
- In `lib/pantryHaul.ts`, the "live" branches of `detectItemsInGroupPhoto`, `identifySingleItem`, and `readNutritionLabel` return the same mock values as the mock branches — the Claude Vision integration is structurally stubbed but not yet implemented.
