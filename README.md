# EzDiet

AI-powered nutrition tracking for iOS and Android. Built with Expo, React Native, and a local SQLite-first data model.

EzDiet personalizes your daily macro and calorie targets from a short smart onboarding (Mifflin–St Jeor + activity and goal multipliers), then gives you a clean daily dashboard to log meals, water, and track streaks.

## Features

- **Smart onboarding** — 4-step flow that collects basic info, goals, activity level, and body composition preference, then auto-calculates daily calorie and macro targets. Flags unhealthy weight-loss paces (>1 kg/week) with a recommended range.
- **Daily dashboard** — Time-aware greeting, streak counter (consecutive days logged), hero "calories remaining" card, calorie progress ring, protein/carbs/fat progress bars, 4 meal slots per day, and a water tracker.
- **Meal slots** — Breakfast, lunch, dinner, and snacks each support full logging or "quick add" (calories only).
- **Water tracker** — Glasses / oz / liters, tap-to-cycle unit, +1 quick-add, and custom amount modal. Entries are converted on display so you can switch units without losing history.
- **Profile** — Full edit surface for every onboarding answer (name, age, gender, height, weight, goal, timeframe, activity, composition) plus editable daily targets with a one-tap "recalculate from plan" button and water settings.
- **Local-first** — All data lives in SQLite on the device. No account, no network dependency for core logging.
- **Light and dark mode** — Follows the system setting with a consistent blue (`#3B82F6`) accent.

## Tech stack

| Concern | Choice |
| --- | --- |
| Runtime | Expo SDK 54, React Native 0.81, React 19 |
| Language | TypeScript (strict) |
| Routing | Expo Router 6 (file-based, typed routes) |
| Storage | `expo-sqlite` (WAL mode, foreign keys on) |
| Charts / graphics | `react-native-svg`, `react-native-chart-kit` |
| Camera / images | `expo-camera`, `expo-image-picker` |
| Misc | `@react-native-async-storage/async-storage`, `@expo/vector-icons` (Ionicons) |

## Architecture

### Folder layout

```
app/
  _layout.tsx            # Root stack; inits DB, sets status bar, themed content bg
  index.tsx              # Boot router: sends users to /onboarding or /dashboard
  onboarding.tsx         # 4-step smart onboarding + result screen
  (tabs)/
    _layout.tsx          # Bottom tabs (Home / Log / Pantry / Profile)
    dashboard.tsx        # Daily dashboard
    log.tsx              # Meal logging (placeholder for now)
    pantry.tsx           # Saved foods (placeholder for now)
    profile.tsx          # Full profile editor + danger zone
components/              # Reusable UI (CalorieRing, MacroBar, MealSlot, WaterCard, QuickAddModal)
lib/
  db/
    client.ts            # DB singleton, schema, idempotent migrations, reset
    users.ts, pantry.ts, meals.ts, recipes.ts, supplements.ts, water.ts
    index.ts             # Barrel export
  nutrition.ts           # BMR / TDEE / BMI / macro math, unit conversions
  date.ts                # Date helpers and greetings
  streak.ts              # Consecutive-day streak computation
  theme.ts               # useTheme() hook + light/dark palettes
  water-units.ts         # Unit conversion helpers
```

### Data model

Single-user, local SQLite. Schema in `lib/db/client.ts`.

| Table | Purpose |
| --- | --- |
| `users` | Profile + daily targets + water settings (single row) |
| `pantry_items` | Saved/scanned foods with per-100g macros. `UNIQUE(name, brand)` for dedupe |
| `meals` + `meal_ingredients` | Logged meals with optional ingredient breakdown |
| `saved_recipes` + `recipe_ingredients` | Reusable recipes |
| `supplements` + `supplement_log` | Supplement catalog + daily log |
| `water_log` | Water intake entries (amount + unit) |

Foreign keys are enforced and indexes cover the hot paths (`logged_at`, FK columns, name/barcode lookups). Timestamps that represent user activity use local time so "today" queries line up with the device clock.

### Macro math

`lib/nutrition.ts` implements the Mifflin–St Jeor equation and the plan calculation used by onboarding and the profile "Recalculate" button:

- **BMR** = `10·kg + 6.25·cm − 5·age + (male +5 / female −161 / other −78)`
- **TDEE** = `BMR · activityMultiplier` — sedentary 1.2, light 1.375, moderate 1.55, very active 1.725
- **Calories** = `TDEE − (weeklyKgDelta · 7700 / 7)`, floored at 1200 (female) / 1500 (male)
- **Protein** = `bodyweightKg · {lose_fat: 1.6, build_muscle: 2.2, maintain/recomp: 1.8}` g
- **Fat** = `calories · 0.25 / 9` g
- **Carbs** = remaining calories `/ 4` g

Weekly rate > 1 kg/week triggers a non-blocking warning with a recommended timeline range.

## Getting started

### Prerequisites

- Node.js 20+
- An iOS or Android device with the **Expo Go** app, or a simulator/emulator

### Install and run

```bash
git clone https://github.com/avi-B-AI-Dev/ezdiet.git
cd ezdiet
npm install
npm start
```

Scan the QR code with Expo Go (Android) or your camera (iOS), or press `i` / `a` in the Metro terminal for simulators.

### Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` | Start and open the iOS simulator |
| `npm run android` | Start and open the Android emulator |
| `npm run web` | Start the web target |
| `npm run lint` | Run Expo's ESLint config |

### Reset local data

If you want to walk through onboarding again, open the app → **Profile** tab → scroll to the bottom → **Reset all app data**. This deletes the SQLite database and routes you back to onboarding.

## Roadmap

- Full meal logging flow (barcode scan, photo capture, AI estimation, search)
- Pantry management UI with favorites
- Historical trends (weekly / monthly macro compliance, weight over time)
- Supplement tracking UI
- Export / import

## License

Private project. All rights reserved.
