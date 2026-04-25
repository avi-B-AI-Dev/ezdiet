import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  consumeLeftover,
  createDish,
  createMeal,
  createRecipe,
  deleteDishesForMeal,
  deleteMeal,
  deleteRecipe,
  getMeal,
  listActiveLeftovers,
  listDishesForMeal,
  listDishIngredients,
  listRecentMeals,
  listRecipes,
  getRecipeIngredients,
  type LeftoverDish,
  type Meal,
  type MealType,
  type SavedRecipe,
} from "@/lib/db";
import { Palette, useTheme } from "@/lib/theme";
import {
  estimatePortionFromPhoto,
  PIPELINE_STEP_LABEL,
  runNutritionPipeline,
  type DisplayItem,
  type NutritionSource,
  type PipelineStep,
  type ResolvedIngredient,
} from "@/lib/nutritionPipeline";

// ───────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────

type DishState = {
  localId: string;
  rawText: string;
  items: DisplayItem[];
  ingredients: ResolvedIngredient[];
  calculated: boolean;
  calculating: boolean;
  step: PipelineStep | null;
  servingsMade: string;
  servingsEaten: string;
  saveAsRecipe: boolean;
  recipeName: string;
  collapsed: boolean;
  name: string;
  warnings: string[];
  errorMsg: string | null;
};

type LeftoverFlow = {
  leftover: LeftoverDish;
  servings: string;
};

const MEAL_OPTIONS: { type: MealType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "breakfast", label: "Breakfast", icon: "sunny-outline" },
  { type: "lunch", label: "Lunch", icon: "restaurant-outline" },
  { type: "dinner", label: "Dinner", icon: "moon-outline" },
  { type: "snack", label: "Snacks", icon: "nutrition-outline" },
];

function newDish(): DishState {
  return {
    localId: Math.random().toString(36).slice(2, 10),
    rawText: "",
    items: [],
    ingredients: [],
    calculated: false,
    calculating: false,
    step: null,
    servingsMade: "1",
    servingsEaten: "1",
    saveAsRecipe: false,
    recipeName: "",
    collapsed: false,
    name: "",
    warnings: [],
    errorMsg: null,
  };
}

// ───────────────────────────────────────────────────────────────────
// Screen
// ───────────────────────────────────────────────────────────────────

export default function MealLogScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{
    mealType?: string;
    mealId?: string;
  }>();

  const initialType = (params.mealType as MealType) || "breakfast";
  const editingMealId = params.mealId ? Number(params.mealId) : null;

  const [mealType, setMealType] = useState<MealType>(initialType);
  const [dishes, setDishes] = useState<DishState[]>([newDish()]);
  const [recentMeals, setRecentMeals] = useState<Meal[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([]);
  const [leftovers, setLeftovers] = useState<LeftoverDish[]>([]);
  const [cameraOpen, setCameraOpen] = useState<string | null>(null); // dish localId
  const [permission, requestPermission] = useCameraPermissions();
  const [leftoverFlow, setLeftoverFlow] = useState<LeftoverFlow | null>(null);
  const [recipePrompt, setRecipePrompt] = useState<{
    dishLocalId: string;
    name: string;
  } | null>(null);

  const dishesRef = useRef(dishes);
  dishesRef.current = dishes;

  // ───── Initial data load
  const loadRecent = useCallback(async () => {
    const [recent, recipes, lefts] = await Promise.all([
      listRecentMeals(10),
      listRecipes(),
      listActiveLeftovers(),
    ]);
    setRecentMeals(recent);
    setSavedRecipes(recipes);
    setLeftovers(lefts);
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // ───── Edit mode: pre-fill from existing meal
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      if (!editingMealId) return;
      const meal = await getMeal(editingMealId);
      if (!meal || cancelled) return;
      const existingDishes = await listDishesForMeal(editingMealId);
      if (cancelled) return;
      setMealType(meal.meal_type);
      if (existingDishes.length > 0) {
        const rebuilt: DishState[] = [];
        for (const d of existingDishes) {
          const ings = await listDishIngredients(d.id);
          if (cancelled) return;
          const ingredients: ResolvedIngredient[] = ings.map((i) => ({
            id: `${i.name}-${i.id}`,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            assumed_weight_g: i.assumed_weight_g ?? 0,
            calories: i.calories,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
            fiber: 0,
            confidence: i.confidence ?? 70,
            source: (i.source as NutritionSource) ?? "manual",
            colorCode:
              i.calories > 200 ? "red" : i.calories >= 50 ? "yellow" : "none",
          }));
          rebuilt.push({
            ...newDish(),
            rawText: ings.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", "),
            calculated: true,
            ingredients,
            items: ingredients.map((ing) => ({ kind: "ingredient", ...ing })),
            servingsMade: String(d.servings_made),
            servingsEaten: String(d.servings_eaten),
            name: d.name ?? "",
            saveAsRecipe: d.is_recipe === 1,
            recipeName: d.recipe_name ?? "",
          });
        }
        setDishes(rebuilt);
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [editingMealId]);

  const updateDish = (localId: string, patch: Partial<DishState>) => {
    setDishes((prev) =>
      prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d)),
    );
  };

  // ───── Running total (user's portion only)
  const runningTotal = useMemo(() => {
    let cal = 0, pro = 0, carb = 0, fat = 0;
    for (const d of dishes) {
      const made = parseNum(d.servingsMade) || 1;
      const eaten = parseNum(d.servingsEaten) || 0;
      const portion = made > 0 ? eaten / made : 0;
      cal += d.ingredients.reduce((s, i) => s + i.calories, 0) * portion;
      pro += d.ingredients.reduce((s, i) => s + i.protein, 0) * portion;
      carb += d.ingredients.reduce((s, i) => s + i.carbs, 0) * portion;
      fat += d.ingredients.reduce((s, i) => s + i.fat, 0) * portion;
    }
    return {
      calories: Math.round(cal),
      protein: Math.round(pro),
      carbs: Math.round(carb),
      fat: Math.round(fat),
    };
  }, [dishes]);

  // ───── Calculate (run the pipeline)
  const handleCalculate = async (localId: string) => {
    const d = dishesRef.current.find((x) => x.localId === localId);
    if (!d) return;
    if (!d.rawText.trim()) {
      updateDish(localId, { errorMsg: "Enter at least one ingredient" });
      return;
    }
    updateDish(localId, {
      calculating: true,
      calculated: false,
      step: "parsing",
      errorMsg: null,
    });
    try {
      const result = await runNutritionPipeline(d.rawText, {
        onStep: (step) => updateDish(localId, { step }),
      });
      updateDish(localId, {
        calculating: false,
        calculated: true,
        step: "done",
        items: result.items,
        ingredients: result.rawIngredients,
        warnings: result.warnings,
      });
    } catch (err) {
      updateDish(localId, {
        calculating: false,
        step: null,
        errorMsg: (err as Error).message || "Something went wrong",
      });
    }
  };

  // ───── Per-ingredient edit / delete (updates totals live)
  const editIngredient = (
    dishLocalId: string,
    ingredientId: string,
    patch: Partial<Pick<ResolvedIngredient, "quantity" | "calories" | "protein" | "carbs" | "fat">>,
  ) => {
    setDishes((prev) =>
      prev.map((d) => {
        if (d.localId !== dishLocalId) return d;
        const ingredients = d.ingredients.map((ing) =>
          ing.id === ingredientId ? { ...ing, ...patch } : ing,
        );
        const items: DisplayItem[] = ingredients.map((ing) => ({
          kind: "ingredient",
          ...ing,
        }));
        return { ...d, ingredients, items };
      }),
    );
  };

  const deleteIngredient = (dishLocalId: string, ingredientId: string) => {
    setDishes((prev) =>
      prev.map((d) => {
        if (d.localId !== dishLocalId) return d;
        const ingredients = d.ingredients.filter((ing) => ing.id !== ingredientId);
        const items: DisplayItem[] = ingredients.map((ing) => ({
          kind: "ingredient",
          ...ing,
        }));
        return { ...d, ingredients, items };
      }),
    );
  };

  const addDish = () => setDishes((prev) => [...prev, newDish()]);

  const removeDish = (localId: string) => {
    setDishes((prev) => {
      const next = prev.filter((d) => d.localId !== localId);
      // Always keep at least one empty dish ready to type into.
      return next.length === 0 ? [newDish()] : next;
    });
  };

  // ───── Log meal (save everything to DB)
  const handleLogMeal = async () => {
    const dishesToSave = dishes.filter((d) => d.ingredients.length > 0);

    // No dishes to save:
    //   - editing an existing meal → delete it (subtracts from dashboard totals)
    //   - new meal → just go back, nothing to discard in the DB
    if (dishesToSave.length === 0) {
      if (editingMealId) {
        await deleteDishesForMeal(editingMealId);
        await deleteMeal(editingMealId);
      }
      router.back();
      return;
    }

    // Totals reflect user's share (what actually goes toward goals)
    const totalCal = runningTotal.calories;
    const totalPro = runningTotal.protein;
    const totalCarb = runningTotal.carbs;
    const totalFat = runningTotal.fat;

    if (editingMealId) {
      // Replace the existing meal's dishes entirely.
      await deleteDishesForMeal(editingMealId);
      await deleteMeal(editingMealId);
    }

    const description = dishesToSave
      .map((d) => d.name || firstFewWords(d.rawText))
      .filter(Boolean)
      .join(" + ") || "Meal";

    const mealId = await createMeal(
      {
        meal_type: mealType,
        input_type: "combination",
        description,
        total_calories: totalCal,
        total_protein: totalPro,
        total_carbs: totalCarb,
        total_fat: totalFat,
        servings: 1,
      },
      [],
    );

    for (const d of dishesToSave) {
      const made = parseNum(d.servingsMade) || 1;
      const eaten = parseNum(d.servingsEaten) || 0;
      const dishCal = d.ingredients.reduce((s, i) => s + i.calories, 0);
      const dishPro = d.ingredients.reduce((s, i) => s + i.protein, 0);
      const dishCarb = d.ingredients.reduce((s, i) => s + i.carbs, 0);
      const dishFat = d.ingredients.reduce((s, i) => s + i.fat, 0);
      const dishId = await createDish(
        {
          meal_id: mealId,
          name: d.name || firstFewWords(d.rawText),
          total_calories: dishCal,
          total_protein: dishPro,
          total_carbs: dishCarb,
          total_fat: dishFat,
          servings_made: made,
          servings_eaten: eaten,
          is_recipe: d.saveAsRecipe,
          recipe_name: d.saveAsRecipe ? d.recipeName || d.name : null,
        },
        d.ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          calories: ing.calories,
          protein: ing.protein,
          carbs: ing.carbs,
          fat: ing.fat,
          confidence: ing.confidence,
          source: ing.source,
          assumed_weight_g: ing.assumed_weight_g,
        })),
      );

      if (d.saveAsRecipe && d.recipeName.trim()) {
        await createRecipe(
          {
            name: d.recipeName.trim(),
            description: null,
            total_calories: dishCal,
            total_protein: dishPro,
            total_carbs: dishCarb,
            total_fat: dishFat,
            default_servings: made,
          },
          d.ingredients.map((ing) => ({
            pantry_item_id: null,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            calories: ing.calories,
            protein: ing.protein,
            carbs: ing.carbs,
            fat: ing.fat,
          })),
        );
      }
      void dishId;
    }

    // Smart recipe suggestion: same signature 2+ times in past 14 days
    const suggestDishId = await findRepeatDish(dishesToSave);
    if (suggestDishId) {
      setRecipePrompt({
        dishLocalId: suggestDishId.localId,
        name: suggestDishId.name || firstFewWords(suggestDishId.rawText),
      });
      return; // defer router.back() until user dismisses
    }
    router.back();
  };

  // ───── Recent meal / recipe / leftover taps (pre-fill ingredients)
  const handleTapRecent = async (meal: Meal) => {
    const existingDishes = await listDishesForMeal(meal.id);
    if (existingDishes.length === 0) return;
    const rebuilt: DishState[] = [];
    for (const d of existingDishes) {
      const ings = await listDishIngredients(d.id);
      const ingredients: ResolvedIngredient[] = ings.map((i) => ({
        id: `${i.name}-${Math.random().toString(36).slice(2, 6)}`,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        assumed_weight_g: i.assumed_weight_g ?? 0,
        calories: i.calories,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
        fiber: 0,
        confidence: i.confidence ?? 70,
        source: (i.source as NutritionSource) ?? "manual",
        colorCode:
          i.calories > 200 ? "red" : i.calories >= 50 ? "yellow" : "none",
      }));
      rebuilt.push({
        ...newDish(),
        rawText: ings.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", "),
        calculated: true,
        ingredients,
        items: ingredients.map((ing) => ({ kind: "ingredient", ...ing })),
        servingsMade: String(d.servings_made),
        servingsEaten: String(d.servings_eaten),
        name: d.name ?? "",
      });
    }
    if (rebuilt.length > 0) setDishes(rebuilt);
  };

  const handleTapRecipe = async (recipe: SavedRecipe) => {
    const ings = await getRecipeIngredients(recipe.id);
    const ingredients: ResolvedIngredient[] = ings.map((i) => ({
      id: `${i.name}-${Math.random().toString(36).slice(2, 6)}`,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      assumed_weight_g: 0,
      calories: i.calories,
      protein: i.protein,
      carbs: i.carbs,
      fat: i.fat,
      fiber: 0,
      confidence: 95,
      source: "pantry",
      colorCode: i.calories > 200 ? "red" : i.calories >= 50 ? "yellow" : "none",
    }));
    const dish: DishState = {
      ...newDish(),
      rawText: ings.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", "),
      calculated: true,
      ingredients,
      items: ingredients.map((ing) => ({ kind: "ingredient", ...ing })),
      servingsMade: String(recipe.default_servings),
      servingsEaten: "1",
      name: recipe.name,
    };
    setDishes([dish]);
  };

  const handleLongPressRecipe = (recipe: SavedRecipe) => {
    Alert.alert(
      "Delete this recipe?",
      recipe.name,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteRecipe(recipe.id);
            loadRecent();
          },
        },
      ],
    );
  };

  const handleTapLeftover = (lo: LeftoverDish) => {
    setLeftoverFlow({
      leftover: lo,
      servings: "1",
    });
  };

  const confirmLeftover = async () => {
    if (!leftoverFlow) return;
    const eaten = parseNum(leftoverFlow.servings);
    if (!eaten || eaten <= 0) {
      Alert.alert("Enter servings", "How many servings did you eat?");
      return;
    }
    const { leftover } = leftoverFlow;
    // Scale the original dish's nutrition to the eaten portion
    const scale = leftover.servings_made > 0 ? eaten / leftover.servings_made : eaten;
    await createMeal(
      {
        meal_type: mealType,
        input_type: "combination",
        description: `${leftover.name ?? "Leftover"} (from ${formatShortLogged(leftover.meal_logged_at)})`,
        total_calories: Math.round(leftover.total_calories * scale),
        total_protein: Math.round(leftover.total_protein * scale),
        total_carbs: Math.round(leftover.total_carbs * scale),
        total_fat: Math.round(leftover.total_fat * scale),
        servings: 1,
        // Link this re-log to the source dish so deleting it later restores
        // the consumed servings.
        from_leftover_dish_id: leftover.id,
        from_leftover_servings: eaten,
      },
      [],
    );
    await consumeLeftover(leftover.id, eaten);
    setLeftoverFlow(null);
    router.back();
  };

  // ───── Camera
  const openCamera = async (dishLocalId: string) => {
    if (!permission) return;
    if (!permission.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(
          "Camera not available",
          "Place item on a plate or bowl and take a photo for portion estimation.",
          [{ text: "OK" }],
        );
        return;
      }
    }
    setCameraOpen(dishLocalId);
  };

  const takePhoto = async () => {
    const dishLocalId = cameraOpen;
    if (!dishLocalId) return;
    setCameraOpen(null);
    const estimate = await estimatePortionFromPhoto("mock");
    // Append to the dish's raw text
    setDishes((prev) =>
      prev.map((d) => {
        if (d.localId !== dishLocalId) return d;
        const existing = d.rawText.trim();
        const joined = existing ? `${existing}, ${estimate.text}` : estimate.text;
        return { ...d, rawText: joined };
      }),
    );
  };

  // ───── Find repeat dish for smart recipe suggestion (14 days, 2+ occurrences)
  const findRepeatDish = async (justSaved: DishState[]) => {
    if (justSaved.length === 0) return null;
    // Compare each just-saved dish against the last 14 days of dishes
    for (const d of justSaved) {
      if (d.saveAsRecipe) continue; // already a recipe
      const sig = ingredientSignature(d.ingredients);
      if (!sig) continue;
      // Count matches in recent history (excluding the just-saved one)
      const allMeals = await listRecentMeals(50);
      let matches = 0;
      for (const m of allMeals) {
        const daysAgo =
          (Date.now() - new Date(m.logged_at).getTime()) / 86400000;
        if (daysAgo > 14) continue;
        const ds = await listDishesForMeal(m.id);
        for (const existing of ds) {
          const ings = await listDishIngredients(existing.id);
          const resolved: ResolvedIngredient[] = ings.map((i) => ({
            id: String(i.id),
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            assumed_weight_g: 0,
            calories: i.calories,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
            fiber: 0,
            confidence: i.confidence ?? 70,
            source: "manual",
            colorCode: "none",
          }));
          if (ingredientSignature(resolved) === sig) matches += 1;
        }
      }
      if (matches >= 2) return d;
    }
    return null;
  };

  const handleSaveSuggestedRecipe = async (name: string) => {
    if (!recipePrompt || !name.trim()) {
      setRecipePrompt(null);
      router.back();
      return;
    }
    const d = dishes.find((x) => x.localId === recipePrompt.dishLocalId);
    if (!d) {
      setRecipePrompt(null);
      router.back();
      return;
    }
    const dishCal = d.ingredients.reduce((s, i) => s + i.calories, 0);
    const dishPro = d.ingredients.reduce((s, i) => s + i.protein, 0);
    const dishCarb = d.ingredients.reduce((s, i) => s + i.carbs, 0);
    const dishFat = d.ingredients.reduce((s, i) => s + i.fat, 0);
    await createRecipe(
      {
        name: name.trim(),
        description: null,
        total_calories: dishCal,
        total_protein: dishPro,
        total_carbs: dishCarb,
        total_fat: dishFat,
        default_servings: parseNum(d.servingsMade) || 1,
      },
      d.ingredients.map((ing) => ({
        pantry_item_id: null,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        calories: ing.calories,
        protein: ing.protein,
        carbs: ing.carbs,
        fat: ing.fat,
      })),
    );
    setRecipePrompt(null);
    router.back();
  };

  // ───────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => pressed && { opacity: 0.5 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {editingMealId ? "Edit meal" : "Log meal"}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        {/* Sticky running total + meal type selector */}
        <View style={styles.stickyTop}>
          <MealTypeSelector
            value={mealType}
            onChange={setMealType}
            colors={colors}
          />
          <View style={styles.totalBar}>
            <View style={styles.totalBarLeft}>
              <Text style={[styles.totalCal, { color: colors.text }]}>
                {runningTotal.calories}
              </Text>
              <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
                cal your share
              </Text>
            </View>
            <View style={styles.totalBarRight}>
              <MacroPill label="P" value={runningTotal.protein} color={colors.accent} />
              <MacroPill label="C" value={runningTotal.carbs} color="#F59E0B" />
              <MacroPill label="F" value={runningTotal.fat} color="#EF4444" />
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* SAVED RECIPES */}
          {savedRecipes.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="bookmark" size={13} color={colors.accent} />
                <Text style={styles.sectionTitle}>Saved recipes</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {savedRecipes.map((r) => (
                  <Pressable
                    key={`rec-${r.id}`}
                    onPress={() => handleTapRecipe(r)}
                    onLongPress={() => handleLongPressRecipe(r)}
                    delayLongPress={350}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: "#EFF6FF",
                        borderColor: "#BFDBFE",
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons name="bookmark" size={14} color={colors.accent} />
                    <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* RECENT MEALS (with leftovers as a special yellow chip) */}
          {(recentMeals.length > 0 || leftovers.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent meals</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {leftovers.map((lo) => (
                  <Pressable
                    key={`lo-${lo.id}`}
                    onPress={() => handleTapLeftover(lo)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: "#FEF3C7",
                        borderColor: "#FCD34D",
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons name="restaurant" size={14} color="#92400E" />
                    <Text style={[styles.chipText, { color: "#92400E" }]} numberOfLines={1}>
                      {lo.name ?? "Leftover"} ({lo.servings_remaining.toFixed(1)} servings left)
                    </Text>
                  </Pressable>
                ))}
                {recentMeals.map((m) => (
                  <Pressable
                    key={`m-${m.id}`}
                    onPress={() => handleTapRecent(m)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.surfaceBorder,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                    <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>
                      {m.description}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Dishes */}
          {dishes.map((d, idx) => (
            <DishCard
              key={d.localId}
              dish={d}
              index={idx + 1}
              colors={colors}
              styles={styles}
              onChangeText={(text) =>
                updateDish(d.localId, { rawText: text, errorMsg: null })
              }
              onCalculate={() => handleCalculate(d.localId)}
              onCamera={() => openCamera(d.localId)}
              onToggleCollapse={() =>
                updateDish(d.localId, { collapsed: !d.collapsed })
              }
              onDelete={() => removeDish(d.localId)}
              onEditIngredient={(ingredientId, patch) =>
                editIngredient(d.localId, ingredientId, patch)
              }
              onDeleteIngredient={(ingredientId) =>
                deleteIngredient(d.localId, ingredientId)
              }
              onServingsMade={(v) => updateDish(d.localId, { servingsMade: v })}
              onServingsEaten={(v) => updateDish(d.localId, { servingsEaten: v })}
              onToggleSaveRecipe={(v) => {
                // Auto-fill recipe name from dish name on toggle-on if blank.
                const patch: Partial<DishState> = { saveAsRecipe: v };
                if (v && !d.recipeName.trim()) {
                  patch.recipeName = (d.name || firstFewWords(d.rawText)).trim();
                }
                updateDish(d.localId, patch);
              }}
              onRecipeName={(v) => updateDish(d.localId, { recipeName: v })}
              onDishName={(v) => {
                // Mirror to recipeName so the auto-filled value stays in sync
                // until the user explicitly edits the recipe name field.
                const patch: Partial<DishState> = { name: v };
                if (
                  d.saveAsRecipe &&
                  (!d.recipeName.trim() || d.recipeName.trim() === d.name.trim())
                ) {
                  patch.recipeName = v;
                }
                updateDish(d.localId, patch);
              }}
            />
          ))}

          <Pressable
            onPress={addDish}
            style={({ pressed }) => [
              styles.addDishBtn,
              { borderColor: colors.accent },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="add" size={18} color={colors.accent} />
            <Text style={[styles.addDishText, { color: colors.accent }]}>
              Add another dish
            </Text>
          </Pressable>

          {(() => {
            const hasIngredients = dishes.some((d) => d.ingredients.length > 0);
            // Three button states:
            //   1. Has ingredients + new      → blue "Log meal"
            //   2. Has ingredients + editing  → blue "Save changes"
            //   3. No ingredients + editing   → red "Delete meal"
            //   4. No ingredients + new       → gray "Discard"
            let label: string;
            let icon: keyof typeof Ionicons.glyphMap;
            let bg: string;
            if (hasIngredients) {
              label = editingMealId ? "Save changes" : "Log meal";
              icon = "checkmark-circle";
              bg = colors.accent;
            } else if (editingMealId) {
              label = "Delete meal";
              icon = "trash";
              bg = "#EF4444";
            } else {
              label = "Discard";
              icon = "close-circle";
              bg = colors.textSubtle;
            }
            return (
              <Pressable
                onPress={handleLogMeal}
                style={({ pressed }) => [
                  styles.logBtn,
                  { backgroundColor: bg },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name={icon} size={20} color={colors.accentText} />
                <Text style={[styles.logBtnText, { color: colors.accentText }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })()}
        </ScrollView>

        {/* Camera modal */}
        <Modal
          visible={!!cameraOpen}
          animationType="slide"
          onRequestClose={() => setCameraOpen(null)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <View style={styles.cameraInstruction}>
              <Text style={styles.cameraInstructionText}>
                Place item on a plate or bowl and take a photo for portion estimation.
              </Text>
            </View>
            {permission?.granted ? (
              <CameraView style={{ flex: 1 }} />
            ) : (
              <View style={styles.cameraFallback}>
                <Ionicons name="camera" size={48} color="#FFF" />
                <Text style={{ color: "#FFF", marginTop: 12 }}>
                  Camera unavailable
                </Text>
              </View>
            )}
            <View style={styles.cameraControls}>
              <Pressable
                onPress={() => setCameraOpen(null)}
                style={styles.cameraCancel}
              >
                <Text style={styles.cameraCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={takePhoto} style={styles.cameraShutter}>
                <View style={styles.cameraShutterInner} />
              </Pressable>
              <View style={{ width: 80 }} />
            </View>
          </View>
        </Modal>

        {/* Leftover flow modal */}
        <Modal
          visible={!!leftoverFlow}
          transparent
          animationType="fade"
          onRequestClose={() => setLeftoverFlow(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.surfaceBorder }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {leftoverFlow?.leftover.name ?? "Leftover"}
              </Text>
              <Text style={[styles.modalBody, { color: colors.textMuted }]}>
                {leftoverFlow?.leftover.servings_remaining.toFixed(1)} servings remaining.
                How many servings did you eat?
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { color: colors.text, borderColor: colors.surfaceBorder },
                ]}
                keyboardType="decimal-pad"
                value={leftoverFlow?.servings ?? ""}
                onChangeText={(v) =>
                  setLeftoverFlow((prev) => (prev ? { ...prev, servings: v.replace(/[^0-9.]/g, "") } : prev))
                }
                placeholder="1"
                placeholderTextColor={colors.placeholder}
                autoFocus
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setLeftoverFlow(null)}
                  style={({ pressed }) => [
                    styles.modalBtn,
                    { borderColor: colors.surfaceBorder },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: "700" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmLeftover}
                  style={({ pressed }) => [
                    styles.modalBtn,
                    { backgroundColor: colors.accent, borderColor: colors.accent },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={{ color: colors.accentText, fontWeight: "700" }}>
                    Log
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Smart recipe suggestion modal */}
        <RecipeSuggestModal
          visible={!!recipePrompt}
          defaultName={recipePrompt?.name ?? ""}
          colors={colors}
          onCancel={() => {
            setRecipePrompt(null);
            router.back();
          }}
          onSave={handleSaveSuggestedRecipe}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────────
// Meal type selector
// ───────────────────────────────────────────────────────────────────

function MealTypeSelector({
  value,
  onChange,
  colors,
}: {
  value: MealType;
  onChange: (t: MealType) => void;
  colors: Palette;
}) {
  return (
    <View style={selectorStyles.row}>
      {MEAL_OPTIONS.map((opt) => {
        const selected = opt.type === value;
        return (
          <Pressable
            key={opt.type}
            onPress={() => onChange(opt.type)}
            style={({ pressed }) => [
              selectorStyles.chip,
              {
                backgroundColor: selected ? colors.accent : colors.surface,
                borderColor: selected ? colors.accent : colors.surfaceBorder,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name={opt.icon}
              size={14}
              color={selected ? colors.accentText : colors.textMuted}
            />
            <Text
              style={[
                selectorStyles.label,
                { color: selected ? colors.accentText : colors.text },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const selectorStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingBottom: 10 },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
  },
  label: { fontSize: 13, fontWeight: "700" },
});

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 14, fontWeight: "700", color: "#475569" }}>
        {label} {Math.round(value)}g
      </Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// Dish card
// ───────────────────────────────────────────────────────────────────

type DishStyles = ReturnType<typeof makeStyles>;

function DishCard({
  dish,
  index,
  colors,
  styles,
  onChangeText,
  onCalculate,
  onCamera,
  onToggleCollapse,
  onDelete,
  onEditIngredient,
  onDeleteIngredient,
  onServingsMade,
  onServingsEaten,
  onToggleSaveRecipe,
  onRecipeName,
  onDishName,
}: {
  dish: DishState;
  index: number;
  colors: Palette;
  styles: DishStyles;
  onChangeText: (text: string) => void;
  onCalculate: () => void;
  onCamera: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onEditIngredient: (
    id: string,
    patch: Partial<Pick<ResolvedIngredient, "quantity" | "calories" | "protein" | "carbs" | "fat">>,
  ) => void;
  onDeleteIngredient: (id: string) => void;
  onServingsMade: (v: string) => void;
  onServingsEaten: (v: string) => void;
  onToggleSaveRecipe: (v: boolean) => void;
  onRecipeName: (v: string) => void;
  onDishName: (v: string) => void;
}) {
  const made = parseNum(dish.servingsMade) || 1;
  const eaten = parseNum(dish.servingsEaten) || 0;
  const portion = made > 0 ? eaten / made : 0;
  const dishSubtotal = {
    calories: dish.ingredients.reduce((s, i) => s + i.calories, 0),
    protein: dish.ingredients.reduce((s, i) => s + i.protein, 0),
    carbs: dish.ingredients.reduce((s, i) => s + i.carbs, 0),
    fat: dish.ingredients.reduce((s, i) => s + i.fat, 0),
  };
  const yourShare = {
    calories: Math.round(dishSubtotal.calories * portion),
    protein: Math.round(dishSubtotal.protein * portion),
    carbs: Math.round(dishSubtotal.carbs * portion),
    fat: Math.round(dishSubtotal.fat * portion),
  };

  return (
    <View style={styles.dishCard}>
      <View style={styles.dishHeader}>
        <Pressable onPress={onToggleCollapse} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <Ionicons
            name={dish.collapsed ? "chevron-forward" : "chevron-down"}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.dishLabel}>Dish {index}</Text>
          {dish.calculated ? (
            <Text style={[styles.dishLabelSub, { color: colors.textMuted }]}>
              · {Math.round(dishSubtotal.calories)} cal
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {!dish.collapsed && (
        <>
          {/* Dish name (optional) */}
          <TextInput
            style={[
              styles.dishNameInput,
              { color: colors.text, borderColor: colors.surfaceBorder },
            ]}
            placeholder="Dish name (optional)"
            placeholderTextColor={colors.placeholder}
            value={dish.name}
            onChangeText={onDishName}
          />

          {/* Ingredient text area + camera */}
          <View style={styles.textareaRow}>
            <TextInput
              style={[
                styles.textarea,
                { color: colors.text, borderColor: colors.surfaceBorder },
              ]}
              placeholder="Type all your ingredients... e.g. 2 cups rice, 1.5 lbs chicken, 2 onions, 3 spoons ghee, salt, turmeric"
              placeholderTextColor={colors.placeholder}
              multiline
              value={dish.rawText}
              onChangeText={onChangeText}
            />
            <Pressable
              onPress={onCamera}
              style={({ pressed }) => [
                styles.cameraBtn,
                { borderColor: colors.surfaceBorder },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="camera" size={20} color={colors.accent} />
            </Pressable>
          </View>

          {dish.errorMsg ? (
            <Text style={styles.errorText}>{dish.errorMsg}</Text>
          ) : null}

          {/* Calculate button */}
          {!dish.calculating && (
            <Pressable
              onPress={onCalculate}
              style={({ pressed }) => [
                styles.calcBtn,
                { backgroundColor: colors.accent },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.calcBtnText, { color: colors.accentText }]}>
                {dish.calculated ? "Recalculate" : "Calculate"}
              </Text>
            </Pressable>
          )}

          {/* Loading steps */}
          {dish.calculating && <PipelineLoader step={dish.step} colors={colors} />}

          {/* Ingredient list */}
          {dish.calculated && dish.items.length > 0 && (
            <View style={styles.ingList}>
              {dish.items.map((item) =>
                item.kind === "spiceGroup" ? (
                  <SpiceGroupRow key={item.id} group={item} colors={colors} />
                ) : (
                  <IngredientRow
                    key={item.id}
                    ing={item}
                    colors={colors}
                    onEdit={(patch) => onEditIngredient(item.id, patch)}
                    onDelete={() => onDeleteIngredient(item.id)}
                  />
                ),
              )}
            </View>
          )}

          {dish.warnings.length > 0 && (
            <View style={styles.warningsBox}>
              {dish.warnings.map((w) => (
                <Text key={w} style={styles.warningsText}>⚠ {w}</Text>
              ))}
            </View>
          )}

          {/* Dish subtotal */}
          {dish.calculated && dish.ingredients.length > 0 && (
            <View style={styles.subtotalRow}>
              <Text style={[styles.subtotalLabel, { color: colors.textMuted }]}>
                Dish subtotal
              </Text>
              <Text style={[styles.subtotalCal, { color: colors.text }]}>
                {Math.round(dishSubtotal.calories)} cal · P{Math.round(dishSubtotal.protein)} C{Math.round(dishSubtotal.carbs)} F{Math.round(dishSubtotal.fat)}
              </Text>
            </View>
          )}

          {/* Servings inputs */}
          {dish.calculated && (
            <>
              <View style={styles.servingsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>How many servings does this make?</Text>
                  <TextInput
                    style={[
                      styles.numInput,
                      { color: colors.text, borderColor: colors.surfaceBorder },
                    ]}
                    keyboardType="decimal-pad"
                    value={dish.servingsMade}
                    onChangeText={(v) => onServingsMade(v.replace(/[^0-9.]/g, ""))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>How many did you eat?</Text>
                  <TextInput
                    style={[
                      styles.numInput,
                      { color: colors.text, borderColor: colors.surfaceBorder },
                    ]}
                    keyboardType="decimal-pad"
                    value={dish.servingsEaten}
                    onChangeText={(v) => onServingsEaten(v.replace(/[^0-9.]/g, ""))}
                  />
                </View>
              </View>
              <View style={[styles.yourShareRow, { backgroundColor: colors.accent }]}>
                <Text style={styles.yourShareLabel}>Your share</Text>
                <Text style={styles.yourShareValue}>
                  {yourShare.calories} cal · P{yourShare.protein} C{yourShare.carbs} F{yourShare.fat}
                </Text>
              </View>

              {/* Save as recipe toggle */}
              <View style={styles.saveRecipeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.saveRecipeLabel, { color: colors.text }]}>
                    Save as recipe
                  </Text>
                  {dish.saveAsRecipe && (
                    <TextInput
                      style={[
                        styles.recipeNameInput,
                        { color: colors.text, borderColor: colors.surfaceBorder },
                      ]}
                      placeholder="Recipe name"
                      placeholderTextColor={colors.placeholder}
                      value={dish.recipeName}
                      onChangeText={onRecipeName}
                    />
                  )}
                </View>
                <Switch
                  value={dish.saveAsRecipe}
                  onValueChange={onToggleSaveRecipe}
                  trackColor={{ false: colors.surfaceBorder, true: colors.accent }}
                />
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// Ingredient row (color coded, editable)
// ───────────────────────────────────────────────────────────────────

function IngredientRow({
  ing,
  colors,
  onEdit,
  onDelete,
}: {
  ing: ResolvedIngredient;
  colors: Palette;
  onEdit: (patch: Partial<Pick<ResolvedIngredient, "quantity" | "calories" | "protein" | "carbs" | "fat">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  // Local input drafts. We only sync them from props when entering edit mode
  // (keyed off ing.id) — that way live-edits don't snap-back while typing.
  const [qty, setQty] = useState(String(ing.quantity));
  const [cal, setCal] = useState(String(Math.round(ing.calories)));
  const [pro, setPro] = useState(String(Math.round(ing.protein)));
  const [carb, setCarb] = useState(String(Math.round(ing.carbs)));
  const [fat, setFat] = useState(String(Math.round(ing.fat)));

  // Captured "base" values when edit mode opens. All Qty changes scale
  // relative to these, so multiple keystrokes never compound.
  const baseRef = useRef({
    qty: ing.quantity,
    cal: ing.calories,
    pro: ing.protein,
    carb: ing.carbs,
    fat: ing.fat,
  });

  const borderColor =
    ing.colorCode === "red"
      ? "#EF4444"
      : ing.colorCode === "yellow"
      ? "#F59E0B"
      : colors.surfaceBorder;

  const enterEdit = () => {
    baseRef.current = {
      qty: ing.quantity,
      cal: ing.calories,
      pro: ing.protein,
      carb: ing.carbs,
      fat: ing.fat,
    };
    setQty(String(ing.quantity));
    setCal(String(Math.round(ing.calories)));
    setPro(String(Math.round(ing.protein)));
    setCarb(String(Math.round(ing.carbs)));
    setFat(String(Math.round(ing.fat)));
    setEditing(true);
  };

  // Live qty change — scale all macros proportionally and propagate up.
  const handleQtyChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    setQty(cleaned);
    const newQty = parseFloat(cleaned);
    if (!Number.isFinite(newQty) || newQty <= 0) return;
    const base = baseRef.current;
    if (base.qty <= 0) {
      onEdit({ quantity: newQty });
      return;
    }
    const scale = newQty / base.qty;
    const newCal = round1(base.cal * scale);
    const newPro = round1(base.pro * scale);
    const newCarb = round1(base.carb * scale);
    const newFat = round1(base.fat * scale);
    setCal(String(Math.round(newCal)));
    setPro(String(Math.round(newPro)));
    setCarb(String(Math.round(newCarb)));
    setFat(String(Math.round(newFat)));
    onEdit({
      quantity: newQty,
      calories: newCal,
      protein: newPro,
      carbs: newCarb,
      fat: newFat,
    });
  };

  // Live macro changes — propagate immediately on keystroke without scaling.
  const handleMacroChange = (
    key: "calories" | "protein" | "carbs" | "fat",
    raw: string,
  ) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    if (key === "calories") setCal(cleaned);
    if (key === "protein") setPro(cleaned);
    if (key === "carbs") setCarb(cleaned);
    if (key === "fat") setFat(cleaned);
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n < 0) return;
    onEdit({ [key]: n });
  };

  return (
    <View style={[ingStyles.row, { borderColor, backgroundColor: colors.surface }]}>
      <View style={{ flex: 1 }}>
        <View style={ingStyles.nameRow}>
          <Text style={[ingStyles.name, { color: colors.text }]} numberOfLines={1}>
            {capitalize(ing.name)}
          </Text>
          <ConfidenceBadge source={ing.source} />
        </View>
        <Text style={[ingStyles.meta, { color: colors.textMuted }]}>
          {formatQtyLabel(ing)} · {Math.round(ing.calories)} cal · P{Math.round(ing.protein)} C{Math.round(ing.carbs)} F{Math.round(ing.fat)}
        </Text>
        {ing.flagged && ing.flagReason ? (
          <Text style={ingStyles.flagText}>⚠ {ing.flagReason} — auto-corrected</Text>
        ) : null}
        {editing && (
          <View style={ingStyles.editGrid}>
            <EditField label="Qty" value={qty} onChange={handleQtyChange} colors={colors} />
            <EditField label="Cal" value={cal} onChange={(v) => handleMacroChange("calories", v)} colors={colors} />
            <EditField label="P" value={pro} onChange={(v) => handleMacroChange("protein", v)} colors={colors} />
            <EditField label="C" value={carb} onChange={(v) => handleMacroChange("carbs", v)} colors={colors} />
            <EditField label="F" value={fat} onChange={(v) => handleMacroChange("fat", v)} colors={colors} />
          </View>
        )}
      </View>
      <View style={ingStyles.actions}>
        <Pressable
          onPress={() => (editing ? setEditing(false) : enterEdit())}
          hitSlop={8}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
        >
          <Ionicons
            name={editing ? "checkmark" : "create-outline"}
            size={20}
            color={colors.accent}
          />
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={8}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
        >
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function EditField({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: Palette;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textSubtle, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          borderRadius: 8,
          width: 64,
          height: 36,
          paddingHorizontal: 8,
          fontSize: 15,
          fontWeight: "600",
          color: colors.text,
          textAlign: "center",
          marginTop: 4,
        }}
        value={value}
        onChangeText={(v) => onChange(v)}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

function SpiceGroupRow({ group, colors }: { group: import("@/lib/nutritionPipeline").SpiceGroup; colors: Palette }) {
  return (
    <View style={[ingStyles.row, { borderColor: colors.surfaceBorder, backgroundColor: "#F1F5F9" }]}>
      <View style={{ flex: 1 }}>
        <Text style={[ingStyles.name, { color: colors.textMuted }]} numberOfLines={2}>
          Spices ({group.names.join(", ")})
        </Text>
        <Text style={[ingStyles.meta, { color: colors.textMuted }]}>
          {Math.round(group.calories)} cal combined
        </Text>
      </View>
    </View>
  );
}

function ConfidenceBadge({ source }: { source: NutritionSource }) {
  let label = "";
  let bg = "#DCFCE7";
  let fg = "#166534";
  if (source === "pantry") {
    label = "Pantry"; bg = "#DCFCE7"; fg = "#166534";
  } else if (source === "cache") {
    label = "Cached"; bg = "#E0E7FF"; fg = "#3730A3";
  } else if (source === "api") {
    label = "API"; bg = "#DBEAFE"; fg = "#1E40AF";
  } else if (source === "ai_estimate") {
    label = "AI estimate"; bg = "#FEF3C7"; fg = "#92400E";
  } else {
    label = "Manual"; bg = "#F1F5F9"; fg = "#475569";
  }
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// Pipeline loader with step indicators
// ───────────────────────────────────────────────────────────────────

const STEP_ORDER: PipelineStep[] = [
  "parsing",
  "pantry",
  "cache",
  "api",
  "ai",
  "aggregating",
];

function PipelineLoader({ step, colors }: { step: PipelineStep | null; colors: Palette }) {
  const activeIdx = step ? STEP_ORDER.indexOf(step) : 0;
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 8, gap: 6 }}>
      {STEP_ORDER.map((s, idx) => {
        const done = idx < activeIdx;
        const active = idx === activeIdx;
        return (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {done ? (
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            ) : active ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="ellipse-outline" size={16} color={colors.textSubtle} />
            )}
            <Text style={{
              fontSize: 13,
              fontWeight: active ? "700" : "500",
              color: done ? colors.textMuted : active ? colors.text : colors.textSubtle,
            }}>
              {PIPELINE_STEP_LABEL[s]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// Recipe suggest modal
// ───────────────────────────────────────────────────────────────────

function RecipeSuggestModal({
  visible,
  defaultName,
  colors,
  onCancel,
  onSave,
}: {
  visible: boolean;
  defaultName: string;
  colors: Palette;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [showNameInput, setShowNameInput] = useState(false);
  useEffect(() => {
    if (visible) {
      setName(defaultName);
      setShowNameInput(false);
    }
  }, [visible, defaultName]);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.surfaceBorder }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Save as a recipe?
          </Text>
          <Text style={[styles.modalBody, { color: colors.textMuted }]}>
            You&apos;ve made this a few times recently. Save it for faster logging next time.
          </Text>
          {showNameInput && (
            <TextInput
              style={[
                styles.modalInput,
                { color: colors.text, borderColor: colors.surfaceBorder },
              ]}
              placeholder="Recipe name"
              placeholderTextColor={colors.placeholder}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          )}
          <View style={styles.modalActions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.modalBtn,
                { borderColor: colors.surfaceBorder },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>Not now</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!showNameInput) {
                  setShowNameInput(true);
                  return;
                }
                onSave(name);
              }}
              style={({ pressed }) => [
                styles.modalBtn,
                { backgroundColor: colors.accent, borderColor: colors.accent },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={{ color: colors.accentText, fontWeight: "700" }}>
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function firstFewWords(s: string): string {
  return s.trim().split(/[\s,]+/).slice(0, 3).join(" ");
}

function formatQtyLabel(ing: ResolvedIngredient): string {
  const q = ing.quantity % 1 === 0 ? String(ing.quantity) : ing.quantity.toFixed(1);
  const weight = ing.assumed_weight_g > 0 ? ` ~${Math.round(ing.assumed_weight_g)}g` : "";
  if (ing.unit === "whole" || ing.unit === "medium" || ing.unit === "small" || ing.unit === "large") {
    return `${q} ${ing.name}${weight}`;
  }
  return `${q} ${ing.unit}${weight}`;
}

function formatShortLogged(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff} days ago`;
}

// Ingredient signature for smart recipe suggestion (match on name set)
function ingredientSignature(ings: ResolvedIngredient[]): string {
  if (ings.length === 0) return "";
  const norm = ings
    .map((i) => i.name.trim().toLowerCase())
    .sort()
    .join("|");
  return norm;
}

// ───────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────

const ingStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    gap: 10,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 18, fontWeight: "800" },
  meta: { fontSize: 15, fontWeight: "500", marginTop: 4 },
  flagText: { fontSize: 12, color: "#B45309", marginTop: 4, fontWeight: "600" },
  actions: { gap: 14, alignItems: "center" },
  editGrid: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: c.text },

    stickyTop: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.surfaceBorder,
      backgroundColor: c.background,
    },
    totalBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    totalBarLeft: { flex: 1 },
    totalCal: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
    totalLabel: { fontSize: 13, fontWeight: "600" },
    totalBarRight: { flexDirection: "row", gap: 12, alignItems: "center" },

    scrollContent: { padding: 16, gap: 16, paddingBottom: 48 },
    section: { gap: 10 },
    sectionTitle: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    chipRow: { gap: 10, paddingVertical: 4 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      maxWidth: 240,
    },
    chipText: { fontSize: 13, fontWeight: "700" },

    dishCard: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    dishHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    dishLabel: { fontSize: 17, fontWeight: "800", color: c.text },
    dishLabelSub: { fontSize: 14, fontWeight: "600" },

    dishNameInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
    },
    textareaRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    textarea: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 100,
      fontSize: 16,
      textAlignVertical: "top",
    },
    cameraBtn: {
      width: 48,
      height: 48,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    errorText: { color: "#DC2626", fontSize: 13, fontWeight: "600" },

    calcBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      borderRadius: 12,
    },
    calcBtnText: { fontSize: 16, fontWeight: "800" },

    ingList: { gap: 12 },

    warningsBox: {
      backgroundColor: "#FEF3C7",
      borderColor: "#FCD34D",
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
    },
    warningsText: { color: "#92400E", fontSize: 12, fontWeight: "600" },

    subtotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
    },
    subtotalLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    subtotalCal: { fontSize: 17, fontWeight: "800" },

    servingsRow: { flexDirection: "row", gap: 12 },
    inputLabel: { fontSize: 12, fontWeight: "800", color: c.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
    numInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 18,
      fontWeight: "700",
    },
    yourShareRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    yourShareLabel: { color: "#FFF", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    yourShareValue: { color: "#FFF", fontSize: 17, fontWeight: "800" },

    saveRecipeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 6,
    },
    saveRecipeLabel: { fontSize: 15, fontWeight: "700" },
    recipeNameInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginTop: 8,
      fontSize: 15,
    },

    addDishBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderStyle: "dashed",
    },
    addDishText: { fontSize: 15, fontWeight: "700" },

    logBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
      marginTop: 4,
    },
    logBtnText: { fontSize: 17, fontWeight: "800" },

    // Camera modal
    cameraInstruction: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: "rgba(0,0,0,0.7)",
    },
    cameraInstructionText: {
      color: "#FFF",
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },
    cameraFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    cameraControls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingVertical: 24,
      backgroundColor: "#000",
    },
    cameraCancel: { width: 80 },
    cameraCancelText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
    cameraShutter: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 3,
      borderColor: "#FFF",
      alignItems: "center",
      justifyContent: "center",
    },
    cameraShutterInner: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: "#FFF",
    },

    // Generic modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 18,
      gap: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: "800" },
    modalBody: { fontSize: 14, lineHeight: 20 },
    modalInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
    },
    modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
    modalBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
    },
  });
