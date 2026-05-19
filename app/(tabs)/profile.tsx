import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  clearAllPantryItems,
  createSupplement,
  deleteSupplement,
  getPantryItemCount,
  getUser,
  listSupplements,
  parseTwiceWeeklyDays,
  resetDatabase,
  saveOnboardingProfile,
  serializeTwiceWeeklyDays,
  SUPPLEMENT_FREQUENCY_LABEL,
  TIME_OF_DAY_LABEL,
  updateSupplement,
  updateWaterSettings,
  type Supplement,
  type SupplementFrequency,
  type TimeOfDay,
  type WaterUnit,
} from "@/lib/db";
import { DAY_NAMES_SHORT, localDateISO } from "@/lib/date";
import {
  type ActivityLevel,
  type BmiCategory,
  type CompositionGoal,
  type DietStyle,
  type Gender,
  type MacroRatio,
  ACTIVITY_MULTIPLIERS,
  DIET_STYLES,
  MIN_FAT_PER_KG,
  allowedCompositions,
  allowedDietStyles,
  bmi,
  bmiCategory,
  bmr,
  calorieFloor,
  cmToFtIn,
  dietStyleLabel,
  ftInToCm,
  idealWeightRangeKg,
  kgToLbs,
  lbsToKg,
  macrosFromCaloriesAndRatio,
  maxWeeklyLossKg,
  minProteinGramsPerKg,
  rebalanceFromCalories,
  rebalanceMacro,
  requiredCaloriesForRate,
  tdee,
  timeframeFromCalories,
  weeklyKgChange,
} from "@/lib/nutrition";
import { Palette, useTheme } from "@/lib/theme";
import { formatWaterAmount, fromMl, toMl, WATER_UNITS } from "@/lib/water-units";

type HeightUnit = "cm" | "ft_in";
type WeightUnit = "kg" | "lbs";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const ACTIVITY_OPTIONS: {
  value: ActivityLevel;
  title: string;
  description: string;
}[] = [
  { value: "sedentary", title: "Sedentary", description: "Desk job, little exercise" },
  { value: "light", title: "Lightly Active", description: "Light exercise 1-3 days/week" },
  { value: "moderate", title: "Moderately Active", description: "Moderate exercise 3-5 days/week" },
  { value: "very_active", title: "Very Active", description: "Hard exercise 6-7 days/week" },
];

const COMPOSITION_OPTIONS: {
  value: CompositionGoal;
  title: string;
  description: string;
}[] = [
  { value: "lose_fat", title: "Lose fat", description: "Reduce body fat while keeping muscle" },
  { value: "build_muscle", title: "Build muscle", description: "Gain lean mass with a slight surplus" },
  { value: "maintain", title: "Maintain weight", description: "Stay where you are" },
  { value: "recomp", title: "Body recomposition", description: "Lose fat and build muscle" },
];

const BMI_COLOR: Record<BmiCategory, string> = {
  underweight: "#3B82F6",
  normal: "#22C55E",
  overweight: "#F59E0B",
  obese: "#EF4444",
};

const BMI_LABEL: Record<BmiCategory, string> = {
  underweight: "Underweight",
  normal: "Normal",
  overweight: "Overweight",
  obese: "Obese",
};

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ scrollTo?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const suppSectionYRef = useRef<number | null>(null);
  const scrolledToSuppRef = useRef(false);

  const [name, setName] = useState("");
  const [ageStr, setAgeStr] = useState("30");
  const [gender, setGender] = useState<Gender | null>(null);

  const [heightUnit, setHeightUnit] = useState<HeightUnit>("ft_in");
  const [heightCmStr, setHeightCmStr] = useState("170");
  const [heightFtStr, setHeightFtStr] = useState("5");
  const [heightInStr, setHeightInStr] = useState("7");

  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [weightStr, setWeightStr] = useState("150");

  const [goalWeightStr, setGoalWeightStr] = useState("140");
  const [timeframeStr, setTimeframeStr] = useState("12");

  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [composition, setComposition] = useState<CompositionGoal | null>(null);

  const [calStr, setCalStr] = useState("0");
  const [protStr, setProtStr] = useState("0");
  const [carbsStr, setCarbsStr] = useState("0");
  const [fatStr, setFatStr] = useState("0");

  const [waterUnit, setWaterUnit] = useState<WaterUnit>("glasses");
  const [waterGoalStr, setWaterGoalStr] = useState("8");

  const [dietStyle, setDietStyle] = useState<DietStyle | null>(null);
  const [proteinPct, setProteinPct] = useState<number | null>(null);
  const [carbsPct, setCarbsPct] = useState<number | null>(null);
  const [fatPct, setFatPct] = useState<number | null>(null);
  const [customProteinStr, setCustomProteinStr] = useState("30");
  const [customCarbsStr, setCustomCarbsStr] = useState("40");
  const [customFatStr, setCustomFatStr] = useState("30");
  const [householdCode, setHouseholdCode] = useState<string | null>(null);

  const [supps, setSupps] = useState<Supplement[]>([]);
  const [pantryCount, setPantryCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [suppFormId, setSuppFormId] = useState<number | "new" | null>(null);
  const [suppName, setSuppName] = useState("");
  const [suppFreq, setSuppFreq] = useState<SupplementFrequency>("daily");
  const [suppTime, setSuppTime] = useState<TimeOfDay>("morning");
  const [suppStartDate, setSuppStartDate] = useState(new Date());
  const [suppDays, setSuppDays] = useState<number[]>([]);
  const [suppShowPicker, setSuppShowPicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const u = await getUser();
    if (!u) return;
    setName(u.name ?? "");
    setAgeStr(String(u.age ?? 30));
    setGender(u.gender ?? null);

    if (u.height_cm != null) {
      const { ft, in: inch } = cmToFtIn(u.height_cm);
      setHeightFtStr(String(ft));
      setHeightInStr(String(inch));
      setHeightCmStr(String(Math.round(u.height_cm)));
    }
    if (u.weight_kg != null) {
      setWeightStr(String(Math.round(kgToLbs(u.weight_kg))));
    }
    if (u.goal_weight_kg != null) {
      setGoalWeightStr(String(Math.round(kgToLbs(u.goal_weight_kg))));
    }
    setTimeframeStr(String(u.timeframe_weeks ?? 12));
    setActivity(u.activity_level ?? null);
    setComposition(u.composition_goal ?? null);

    setCalStr(String(u.daily_calorie_goal));
    setProtStr(String(u.daily_protein_goal));
    setCarbsStr(String(u.daily_carbs_goal));
    setFatStr(String(u.daily_fat_goal));

    setWaterUnit(u.water_unit);
    const ml =
      u.water_goal_ml ??
      (u.water_unit === "glasses"
        ? u.water_goal * 237
        : u.water_unit === "oz"
          ? u.water_goal * 29.57
          : u.water_goal * 1000);
    setWaterGoalStr(formatWaterAmount(fromMl(ml, u.water_unit), u.water_unit));

    setDietStyle(u.diet_style);
    setProteinPct(u.protein_pct);
    setCarbsPct(u.carbs_pct);
    setFatPct(u.fat_pct);
    if (u.diet_style === "custom") {
      setCustomProteinStr(String(u.protein_pct ?? 30));
      setCustomCarbsStr(String(u.carbs_pct ?? 40));
      setCustomFatStr(String(u.fat_pct ?? 30));
    }
    setHouseholdCode(u.household_code);
    setLoaded(true);
  }, []);

  const loadSupps = useCallback(async () => {
    const list = await listSupplements();
    setSupps(list);
  }, []);

  const loadPantryCount = useCallback(async () => {
    setPantryCount(await getPantryItemCount());
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!loaded) load();
      loadSupps();
      loadPantryCount();
      scrolledToSuppRef.current = false;
      if (
        params.scrollTo === "supplements" &&
        suppSectionYRef.current != null
      ) {
        scrollRef.current?.scrollTo({
          y: suppSectionYRef.current,
          animated: true,
        });
        scrolledToSuppRef.current = true;
      }
    }, [load, loaded, loadSupps, loadPantryCount, params.scrollTo]),
  );

  const openAddSuppForm = () => {
    setSuppFormId("new");
    setSuppName("");
    setSuppFreq("daily");
    setSuppTime("morning");
    setSuppStartDate(new Date());
    setSuppDays([]);
    setSuppShowPicker(false);
  };

  const openEditSuppForm = (s: Supplement) => {
    setSuppFormId(s.id);
    setSuppName(s.name);
    setSuppFreq(s.frequency ?? "daily");
    setSuppTime(s.time_of_day ?? "morning");
    if (s.start_date) {
      const [y, m, d] = s.start_date.split("-").map(Number);
      setSuppStartDate(new Date(y, m - 1, d));
    } else {
      setSuppStartDate(new Date());
    }
    setSuppDays(parseTwiceWeeklyDays(s.twice_weekly_days));
    setSuppShowPicker(false);
  };

  const closeSuppForm = () => {
    setSuppFormId(null);
    setSuppShowPicker(false);
  };

  const handleSaveSupp = async () => {
    if (!suppName.trim() || suppFormId == null) return;
    if (suppFreq === "twice_weekly" && suppDays.length !== 2) {
      Alert.alert(
        "Pick two days",
        "For a twice-a-week supplement, please select exactly two days of the week.",
      );
      return;
    }
    const input = {
      name: suppName.trim(),
      brand: null,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      micronutrients: null,
      frequency: suppFreq,
      time_of_day: suppTime,
      start_date: localDateISO(suppStartDate),
      twice_weekly_days:
        suppFreq === "twice_weekly" ? serializeTwiceWeeklyDays(suppDays) : null,
    };
    try {
      if (suppFormId === "new") {
        await createSupplement(input);
      } else {
        await updateSupplement(suppFormId, input);
      }
      closeSuppForm();
      await loadSupps();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Could not save supplement", msg);
    }
  };

  const handleDeleteSupp = (s: Supplement) => {
    Alert.alert(
      `Delete ${s.name}?`,
      "This removes the supplement from tracking. Past log entries are also deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteSupplement(s.id);
            if (suppFormId === s.id) closeSuppForm();
            await loadSupps();
          },
        },
      ],
    );
  };

  const openSuppAndroidPicker = () => {
    DateTimePickerAndroid.open({
      value: suppStartDate,
      mode: "date",
      onChange: (_e, selected) => {
        if (selected) setSuppStartDate(selected);
      },
    });
  };

  const onSuppIosDateChange = (
    _e: DateTimePickerEvent,
    selected?: Date,
  ) => {
    if (selected) setSuppStartDate(selected);
  };

  const heightCm =
    heightUnit === "cm"
      ? Number(heightCmStr) || 0
      : ftInToCm(Number(heightFtStr) || 0, Number(heightInStr) || 0);
  const weightKg =
    weightUnit === "kg" ? Number(weightStr) || 0 : lbsToKg(Number(weightStr) || 0);
  const goalKg =
    weightUnit === "kg"
      ? Number(goalWeightStr) || 0
      : lbsToKg(Number(goalWeightStr) || 0);
  const age = Number(ageStr) || 0;
  const timeframe = Number(timeframeStr) || 0;
  const weeklyKg = weeklyKgChange(weightKg, goalKg, timeframe);
  const bmiValue = bmi(weightKg, heightCm);
  const bmiCat = bmiCategory(bmiValue);

  const customRatio: MacroRatio = {
    proteinPct: Number(customProteinStr) || 0,
    carbsPct: Number(customCarbsStr) || 0,
    fatPct: Number(customFatStr) || 0,
  };
  const customTotal =
    customRatio.proteinPct + customRatio.carbsPct + customRatio.fatPct;

  const effectiveRatio: MacroRatio | null = useMemo(() => {
    if (dietStyle === "custom") {
      if (customTotal === 100) return customRatio;
      if (proteinPct != null && carbsPct != null && fatPct != null) {
        return { proteinPct, carbsPct, fatPct };
      }
      return null;
    }
    if (dietStyle) return DIET_STYLES[dietStyle];
    return null;
  }, [dietStyle, customRatio, customTotal, proteinPct, carbsPct, fatPct]);

  const availableCompositions = useMemo(
    () => allowedCompositions(weightKg, goalKg),
    [weightKg, goalKg],
  );
  const availableDietStyles = useMemo(
    () => allowedDietStyles(composition),
    [composition],
  );

  useEffect(() => {
    if (composition && !availableCompositions.includes(composition)) {
      setComposition(null);
    }
  }, [availableCompositions, composition]);

  const pickComposition = (c: CompositionGoal) => {
    setComposition(c);
    if (c === "recomp") {
      setDietStyle("high_protein");
    } else if (dietStyle && !allowedDietStyles(c).includes(dietStyle)) {
      setDietStyle(null);
    }
  };

  const minCalories = gender ? calorieFloor(gender, weightKg) : 0;
  const tdeeValue = useMemo(() => {
    if (!gender || !activity || weightKg <= 0 || heightCm <= 0 || age <= 0)
      return 0;
    return tdee(bmr({ weightKg, heightCm, age, gender }), activity);
  }, [gender, activity, weightKg, heightCm, age]);
  const maxLossKg = tdeeValue > 0 ? maxWeeklyLossKg(tdeeValue, minCalories) : 0;
  const ideal = idealWeightRangeKg(heightCm);

  const formatWeightVal = (kg: number) =>
    weightUnit === "kg" ? kg.toFixed(1) : String(Math.round(kgToLbs(kg)));

  const handleCaloriesChange = (v: string) => {
    const clean = v.replace(/[^0-9]/g, "");
    setCalStr(clean);
    if (!effectiveRatio || !composition) return;
    const cal = Number(clean) || 0;
    const m = rebalanceFromCalories(cal, effectiveRatio, weightKg, composition);
    setProtStr(String(m.protein));
    setCarbsStr(String(m.carbs));
    setFatStr(String(m.fat));
    if (tdeeValue > 0) {
      const tf = timeframeFromCalories(tdeeValue, cal, weightKg, goalKg);
      if (tf != null) setTimeframeStr(String(tf));
    }
  };

  const handleMacroChange = (
    which: "protein" | "carbs" | "fat",
    v: string,
  ) => {
    const clean = v.replace(/[^0-9]/g, "");
    if (which === "protein") setProtStr(clean);
    else if (which === "carbs") setCarbsStr(clean);
    else setFatStr(clean);
    if (!effectiveRatio) return;
    const current = {
      calories: Number(calStr) || 0,
      protein: Number(protStr) || 0,
      carbs: Number(carbsStr) || 0,
      fat: Number(fatStr) || 0,
    };
    const newVal = Number(clean) || 0;
    const m = rebalanceMacro(current, which, newVal, effectiveRatio);
    if (which !== "protein") setProtStr(String(m.protein));
    if (which !== "carbs") setCarbsStr(String(m.carbs));
    if (which !== "fat") setFatStr(String(m.fat));
  };

  const handlePickDietStyle = (style: DietStyle) => {
    setDietStyle(style);
    const ratio =
      style === "custom"
        ? { proteinPct: Number(customProteinStr) || 0, carbsPct: Number(customCarbsStr) || 0, fatPct: Number(customFatStr) || 0 }
        : DIET_STYLES[style];
    if (style !== "custom") {
      setProteinPct(ratio.proteinPct);
      setCarbsPct(ratio.carbsPct);
      setFatPct(ratio.fatPct);
    }
    if (!composition) return;
    const cal = Number(calStr) || 0;
    if (cal <= 0) return;
    const m = rebalanceFromCalories(cal, ratio, weightKg, composition);
    setProtStr(String(m.protein));
    setCarbsStr(String(m.carbs));
    setFatStr(String(m.fat));
  };

  const liveAdjustment = useMemo(() => {
    if (!effectiveRatio || !composition) return null;
    const cal = Number(calStr) || 0;
    if (cal <= 0 || weightKg <= 0) return null;
    return macrosFromCaloriesAndRatio(cal, effectiveRatio, weightKg, composition);
  }, [effectiveRatio, composition, calStr, weightKg]);

  const customMinProteinG = weightKg * minProteinGramsPerKg(composition ?? "lose_fat");
  const customMinFatG = weightKg * MIN_FAT_PER_KG;
  const customCalNum = Number(calStr) || 0;
  const customMinProteinPct =
    customCalNum > 0 ? Math.ceil((customMinProteinG * 4 * 100) / customCalNum) : 0;
  const customMinFatPct =
    customCalNum > 0 ? Math.ceil((customMinFatG * 9 * 100) / customCalNum) : 0;
  const customProteinPctNum = Number(customProteinStr) || 0;
  const customFatPctNum = Number(customFatStr) || 0;
  const customProteinBelow =
    dietStyle === "custom" && customProteinPctNum < customMinProteinPct;
  const customFatBelow =
    dietStyle === "custom" && customFatPctNum < customMinFatPct;

  const toggleHeightUnit = () => {
    if (heightUnit === "ft_in") {
      setHeightCmStr(String(Math.round(heightCm)));
      setHeightUnit("cm");
    } else {
      const { ft, in: inch } = cmToFtIn(heightCm);
      setHeightFtStr(String(ft));
      setHeightInStr(String(inch));
      setHeightUnit("ft_in");
    }
  };

  const toggleWeightUnit = () => {
    const cur = Number(weightStr) || 0;
    const goal = Number(goalWeightStr) || 0;
    if (weightUnit === "lbs") {
      setWeightStr(String(Math.round(lbsToKg(cur) * 10) / 10));
      setGoalWeightStr(String(Math.round(lbsToKg(goal) * 10) / 10));
      setWeightUnit("kg");
    } else {
      setWeightStr(String(Math.round(kgToLbs(cur))));
      setGoalWeightStr(String(Math.round(kgToLbs(goal))));
      setWeightUnit("lbs");
    }
  };

  const canSave =
    name.trim().length > 0 &&
    age >= 13 &&
    age <= 120 &&
    !!gender &&
    heightCm >= 50 &&
    weightKg >= 20 &&
    goalKg > 0 &&
    timeframe > 0 &&
    !!activity &&
    !!composition;

  const handleSave = async () => {
    if (!canSave || !gender || !activity || !composition) return;
    setSaving(true);
    try {
      await saveOnboardingProfile({
        name: name.trim(),
        age,
        gender,
        height_cm: heightCm,
        weight_kg: weightKg,
        goal_weight_kg: goalKg,
        timeframe_weeks: timeframe,
        activity_level: activity,
        composition_goal: composition,
        daily_calorie_goal: Number(calStr) || 0,
        daily_protein_goal: Number(protStr) || 0,
        daily_carbs_goal: Number(carbsStr) || 0,
        daily_fat_goal: Number(fatStr) || 0,
        diet_style: dietStyle,
        protein_pct: effectiveRatio?.proteinPct ?? proteinPct,
        carbs_pct: effectiveRatio?.carbsPct ?? carbsPct,
        fat_pct: effectiveRatio?.fatPct ?? fatPct,
        household_code: householdCode,
      });
      await updateWaterSettings(
        waterUnit,
        toMl(Number(waterGoalStr) || 0, waterUnit),
      );
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Reset all app data?",
      "This deletes your profile, meals, pantry, water log, and everything else. You'll be sent back to onboarding. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetDatabase();
            router.replace("/");
          },
        },
      ],
    );
  };

  const handleClearPantry = () => {
    if (pantryCount === 0) return;
    const noun = pantryCount === 1 ? "item" : "items";
    Alert.alert(
      "Delete all pantry items?",
      `This will remove all ${pantryCount} ${noun} from your pantry. Your meal history and cache are unaffected. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await clearAllPantryItems();
            await loadPantryCount();
            setToast("Pantry cleared");
            setTimeout(() => setToast(null), 2500);
          },
        },
      ],
    );
  };

  const weeklyDisplay =
    weightUnit === "kg"
      ? `${weeklyKg.toFixed(2)} kg/week`
      : `${kgToLbs(weeklyKg).toFixed(1)} lbs/week`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.heading}>Profile</Text>
            <Text style={styles.sub}>Review and edit your plan.</Text>
          </View>

          {/* About you */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About you</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.accent}
                maxLength={40}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Age</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={ageStr}
                  onChangeText={(v) => setAgeStr(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>years</Text>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.chipRow}>
                {GENDERS.map((g) => {
                  const active = gender === g.value;
                  return (
                    <Pressable
                      key={g.value}
                      onPress={() => setGender(g.value)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          borderColor: active ? colors.accent : colors.surfaceBorder,
                          backgroundColor: active ? colors.accent : "transparent",
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? colors.accentText : colors.text,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        {g.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Body */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Body</Text>
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Height</Text>
                <Pressable
                  onPress={toggleHeightUnit}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.toggle,
                    { borderColor: colors.surfaceBorder },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.toggleText}>
                    {heightUnit === "cm" ? "cm" : "ft / in"}
                  </Text>
                  <Ionicons name="swap-horizontal" size={12} color={colors.textMuted} />
                </Pressable>
              </View>
              {heightUnit === "cm" ? (
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.numInput}
                    value={heightCmStr}
                    onChangeText={(v) => setHeightCmStr(v.replace(/[^0-9.]/g, ""))}
                    keyboardType="decimal-pad"
                    maxLength={5}
                    selectionColor={colors.accent}
                  />
                  <Text style={styles.inputUnit}>cm</Text>
                </View>
              ) : (
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.numInput, { flex: 0, width: 60 }]}
                    value={heightFtStr}
                    onChangeText={(v) => setHeightFtStr(v.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectionColor={colors.accent}
                  />
                  <Text style={styles.inputUnit}>ft</Text>
                  <TextInput
                    style={[styles.numInput, { flex: 0, width: 60, marginLeft: 12 }]}
                    value={heightInStr}
                    onChangeText={(v) => setHeightInStr(v.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    maxLength={2}
                    selectionColor={colors.accent}
                  />
                  <Text style={styles.inputUnit}>in</Text>
                </View>
              )}
            </View>
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Weight</Text>
                <Pressable
                  onPress={toggleWeightUnit}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.toggle,
                    { borderColor: colors.surfaceBorder },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.toggleText}>{weightUnit}</Text>
                  <Ionicons name="swap-horizontal" size={12} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={weightStr}
                  onChangeText={(v) => setWeightStr(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  maxLength={5}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>{weightUnit}</Text>
              </View>
            </View>
            {bmiValue > 0 ? (
              <View style={styles.bmiCard}>
                <View>
                  <Text style={styles.bmiLabel}>BMI</Text>
                  <Text style={styles.bmiValue}>{bmiValue.toFixed(1)}</Text>
                </View>
                <View style={[styles.bmiChip, { backgroundColor: BMI_COLOR[bmiCat] }]}>
                  <Text style={styles.bmiChipText}>{BMI_LABEL[bmiCat]}</Text>
                </View>
              </View>
            ) : null}
            {heightCm > 0 ? (
              <Text style={styles.hintText}>
                Based on your height, your ideal weight range is{" "}
                {formatWeightVal(ideal.minKg)}–{formatWeightVal(ideal.maxKg)}{" "}
                {weightUnit}.
              </Text>
            ) : null}
          </View>

          {/* Goal */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Goal</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Goal weight</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={goalWeightStr}
                  onChangeText={(v) => setGoalWeightStr(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  maxLength={5}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>{weightUnit}</Text>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Timeframe</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={timeframeStr}
                  onChangeText={(v) => setTimeframeStr(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>weeks</Text>
              </View>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>
                {weeklyKg > 0
                  ? "Weekly loss rate"
                  : weeklyKg < 0
                    ? "Weekly gain rate"
                    : "Maintenance"}
              </Text>
              <Text style={styles.infoValue}>
                {weeklyKg === 0 ? "—" : weeklyDisplay}
              </Text>
            </View>
            {tdeeValue > 0 ? (
              <Text style={styles.hintText}>
                Your fastest safe weight loss rate is{" "}
                {weightUnit === "kg"
                  ? `${maxLossKg.toFixed(2)} kg/week`
                  : `${kgToLbs(maxLossKg).toFixed(1)} lbs/week`}
                .
              </Text>
            ) : null}
            {tdeeValue > 0 && weeklyKg > 0 &&
            requiredCaloriesForRate(tdeeValue, weeklyKg) < minCalories ? (
              <View
                style={[
                  styles.warnCard,
                  { borderColor: "#EF4444" },
                ]}
              >
                <Ionicons name="warning" size={18} color="#EF4444" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.warnTitle}>Too fast</Text>
                  <Text style={styles.warnBody}>
                    This would require eating below your minimum safe calories
                    of {minCalories} cal. Try a longer timeframe.
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <Text style={styles.subLabel}>Composition goal</Text>
              {COMPOSITION_OPTIONS.filter((opt) =>
                availableCompositions.includes(opt.value),
              ).map((opt) => (
                <OptionRadio
                  key={opt.value}
                  colors={colors}
                  styles={styles}
                  title={opt.title}
                  description={opt.description}
                  active={composition === opt.value}
                  onPress={() => pickComposition(opt.value)}
                />
              ))}
            </View>
          </View>

          {/* Activity */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity</Text>
            <View style={{ gap: 8 }}>
              {ACTIVITY_OPTIONS.map((opt) => (
                <OptionRadio
                  key={opt.value}
                  colors={colors}
                  styles={styles}
                  title={opt.title}
                  description={opt.description}
                  active={activity === opt.value}
                  onPress={() => setActivity(opt.value)}
                />
              ))}
            </View>
          </View>

          {/* Diet style */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Diet style</Text>
            <View style={{ gap: 8 }}>
              {(["balanced", "high_protein", "keto", "low_carb", "custom"] as DietStyle[])
                .filter((s) => availableDietStyles.includes(s))
                .map((style) => (
                  <OptionRadio
                    key={style}
                    colors={colors}
                    styles={styles}
                    title={dietStyleLabel(style)}
                    description={
                      style === "custom"
                        ? "Set your own protein / carbs / fat split"
                        : DIET_STYLES[style].description
                    }
                    active={dietStyle === style}
                    onPress={() => handlePickDietStyle(style)}
                  />
                ))}
            </View>
            {dietStyle === "custom" ? (
              <View style={styles.field}>
                <Text style={styles.label}>Custom ratio (total must be 100%)</Text>
                <View style={styles.customRatioRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customRatioLabel}>Protein</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.numInput}
                        value={customProteinStr}
                        onChangeText={(v) =>
                          setCustomProteinStr(v.replace(/[^0-9]/g, ""))
                        }
                        keyboardType="number-pad"
                        maxLength={3}
                        selectionColor={colors.accent}
                      />
                      <Text style={styles.inputUnit}>%</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customRatioLabel}>Carbs</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.numInput}
                        value={customCarbsStr}
                        onChangeText={(v) =>
                          setCustomCarbsStr(v.replace(/[^0-9]/g, ""))
                        }
                        keyboardType="number-pad"
                        maxLength={3}
                        selectionColor={colors.accent}
                      />
                      <Text style={styles.inputUnit}>%</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customRatioLabel}>Fat</Text>
                    <View style={styles.inputRow}>
                      <TextInput
                        style={styles.numInput}
                        value={customFatStr}
                        onChangeText={(v) =>
                          setCustomFatStr(v.replace(/[^0-9]/g, ""))
                        }
                        keyboardType="number-pad"
                        maxLength={3}
                        selectionColor={colors.accent}
                      />
                      <Text style={styles.inputUnit}>%</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text
                    style={[
                      styles.totalValue,
                      { color: customTotal === 100 ? "#22C55E" : "#EF4444" },
                    ]}
                  >
                    {customTotal}%
                  </Text>
                </View>
                {customProteinBelow && customCalNum > 0 ? (
                  <Text style={{ color: "#F59E0B", fontSize: 12, marginTop: 4 }}>
                    Minimum protein: {Math.round(customMinProteinG)} g
                    {customMinProteinPct ? ` (≈ ${customMinProteinPct}%)` : ""}
                  </Text>
                ) : null}
                {customFatBelow && customCalNum > 0 ? (
                  <Text style={{ color: "#F59E0B", fontSize: 12, marginTop: 2 }}>
                    Minimum fat: {Math.round(customMinFatG)} g
                    {customMinFatPct ? ` (≈ ${customMinFatPct}%)` : ""}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Daily targets */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Daily targets</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Daily Calories</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={calStr}
                  onChangeText={handleCaloriesChange}
                  keyboardType="number-pad"
                  maxLength={5}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>kcal</Text>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Protein</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={protStr}
                  onChangeText={(v) => handleMacroChange("protein", v)}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>g</Text>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Carbs</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={carbsStr}
                  onChangeText={(v) => handleMacroChange("carbs", v)}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>g</Text>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Fat</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={fatStr}
                  onChangeText={(v) => handleMacroChange("fat", v)}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>g</Text>
              </View>
            </View>
            {liveAdjustment?.insufficient ? (
              <View style={[styles.warnCard, { borderColor: "#EF4444" }]}>
                <Ionicons name="warning" size={18} color="#EF4444" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.warnTitle}>Calorie target too low</Text>
                  <Text style={styles.warnBody}>
                    Your calorie target is too low for this diet at your weight.
                  </Text>
                </View>
              </View>
            ) : liveAdjustment?.adjusted ? (
              <Text style={styles.hintText}>
                Adjusted to meet your minimum protein/fat needs.
              </Text>
            ) : null}
            {minCalories > 0 && (Number(calStr) || 0) > 0 &&
            (Number(calStr) || 0) < minCalories ? (
              <View style={[styles.warnCard, { borderColor: "#EF4444" }]}>
                <Ionicons name="warning" size={18} color="#EF4444" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.warnTitle}>Below minimum</Text>
                  <Text style={styles.warnBody}>
                    {Number(calStr)} cal is below your minimum safe intake of{" "}
                    {minCalories} cal.
                    {tdeeValue > 0 && weightKg > goalKg && maxLossKg > 0
                      ? ` At minimum intake, you'd reach your goal in ${Math.ceil((weightKg - goalKg) / maxLossKg)} weeks.`
                      : ""}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Water */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Water</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Unit</Text>
              <View style={styles.chipRow}>
                {WATER_UNITS.map((u) => {
                  const active = u === waterUnit;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => {
                        if (u === waterUnit) return;
                        const currentMl = toMl(
                          Number(waterGoalStr) || 0,
                          waterUnit,
                        );
                        setWaterGoalStr(
                          formatWaterAmount(fromMl(currentMl, u), u),
                        );
                        setWaterUnit(u);
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          borderColor: active ? colors.accent : colors.surfaceBorder,
                          backgroundColor: active ? colors.accent : "transparent",
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? colors.accentText : colors.text,
                          fontWeight: "600",
                          textTransform: "capitalize",
                          fontSize: 13,
                        }}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Daily goal</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={waterGoalStr}
                  onChangeText={(v) => setWaterGoalStr(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>{waterUnit}</Text>
              </View>
            </View>
          </View>

          {savedAt ? (
            <View style={styles.savedBanner}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: "600" }}>Saved</Text>
            </View>
          ) : null}

          <View
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              suppSectionYRef.current = y;
              if (
                params.scrollTo === "supplements" &&
                !scrolledToSuppRef.current
              ) {
                scrolledToSuppRef.current = true;
                scrollRef.current?.scrollTo({ y, animated: true });
              }
            }}
          >
            <SupplementsSection
              colors={colors}
              styles={styles}
              supps={supps}
              suppFormId={suppFormId}
              suppName={suppName}
              setSuppName={setSuppName}
              suppFreq={suppFreq}
              setSuppFreq={setSuppFreq}
              suppTime={suppTime}
              setSuppTime={setSuppTime}
              suppStartDate={suppStartDate}
              suppDays={suppDays}
              setSuppDays={setSuppDays}
              showPicker={suppShowPicker}
              setShowPicker={setSuppShowPicker}
              onAdd={openAddSuppForm}
              onEdit={openEditSuppForm}
              onDelete={handleDeleteSupp}
              onCancel={closeSuppForm}
              onSave={handleSaveSupp}
              openAndroidPicker={openSuppAndroidPicker}
              onIosDateChange={onSuppIosDateChange}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Management</Text>
            <Pressable
              onPress={handleClearPantry}
              disabled={pantryCount === 0}
              style={({ pressed }) => [
                styles.dangerBtn,
                pantryCount === 0 && { opacity: 0.5 },
                pressed && pantryCount > 0 && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="basket-outline" size={16} color="#EF4444" />
              <Text style={styles.dangerBtnText}>
                Clear pantry ({pantryCount} {pantryCount === 1 ? "item" : "items"})
              </Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Danger zone</Text>
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [
                styles.dangerBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
              <Text style={styles.dangerBtnText}>Reset all app data</Text>
            </Pressable>
          </View>
        </ScrollView>

        {toast && (
          <View pointerEvents="none" style={styles.toast}>
            <Ionicons name="checkmark-circle" size={16} color="#FFF" />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={handleSave}
            disabled={saving || !canSave}
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.85 },
              (saving || !canSave) && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.buttonText}>
              {saving ? "Saving…" : "Save changes"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SupplementsSection(props: {
  colors: Palette;
  styles: Styles;
  supps: Supplement[];
  suppFormId: number | "new" | null;
  suppName: string;
  setSuppName: (s: string) => void;
  suppFreq: SupplementFrequency;
  setSuppFreq: (f: SupplementFrequency) => void;
  suppTime: TimeOfDay;
  setSuppTime: (t: TimeOfDay) => void;
  suppStartDate: Date;
  suppDays: number[];
  setSuppDays: (d: number[]) => void;
  showPicker: boolean;
  setShowPicker: (b: boolean) => void;
  onAdd: () => void;
  onEdit: (s: Supplement) => void;
  onDelete: (s: Supplement) => void;
  onCancel: () => void;
  onSave: () => void;
  openAndroidPicker: () => void;
  onIosDateChange: (e: DateTimePickerEvent, d?: Date) => void;
}) {
  const {
    colors,
    styles,
    supps,
    suppFormId,
    suppName,
    setSuppName,
    suppFreq,
    setSuppFreq,
    suppTime,
    setSuppTime,
    suppStartDate,
    suppDays,
    setSuppDays,
    showPicker,
    setShowPicker,
    onAdd,
    onEdit,
    onDelete,
    onCancel,
    onSave,
    openAndroidPicker,
    onIosDateChange,
  } = props;

  const FREQS: SupplementFrequency[] = [
    "daily",
    "twice_weekly",
    "weekly",
    "biweekly",
    "monthly",
  ];
  const TIMES: TimeOfDay[] = ["morning", "afternoon", "evening", "with_meal"];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Supplements &amp; Medications</Text>

      {supps.length === 0 && suppFormId == null ? (
        <View
          style={[
            styles.field,
            { alignItems: "center", paddingVertical: 16 },
          ]}
        >
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              textAlign: "center",
            }}
          >
            No supplements yet.
          </Text>
        </View>
      ) : null}

      {supps.map((s) =>
        suppFormId === s.id ? null : (
          <View
            key={s.id}
            style={[
              styles.suppListCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.suppListName, { color: colors.text }]}>
                {s.name}
              </Text>
              <Text
                style={[styles.suppListMeta, { color: colors.textMuted }]}
              >
                {s.frequency ? SUPPLEMENT_FREQUENCY_LABEL[s.frequency] : "—"}
                {" · "}
                {s.time_of_day ? TIME_OF_DAY_LABEL[s.time_of_day] : "—"}
                {s.start_date ? ` · starts ${s.start_date}` : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => onEdit(s)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && { opacity: 0.5 },
              ]}
            >
              <Ionicons
                name="create-outline"
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
            <Pressable
              onPress={() => onDelete(s)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconBtn,
                pressed && { opacity: 0.5 },
              ]}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </Pressable>
          </View>
        ),
      )}

      {suppFormId != null ? (
        <View style={{ gap: 10 }}>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={suppName}
              onChangeText={setSuppName}
              placeholder="e.g. Multivitamin"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.accent}
              maxLength={60}
              autoFocus
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Frequency</Text>
            <View style={styles.chipRow}>
              {FREQS.map((f) => {
                const active = suppFreq === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setSuppFreq(f)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: active ? colors.accent : colors.surfaceBorder,
                        backgroundColor: active ? colors.accent : "transparent",
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? colors.accentText : colors.text,
                        fontWeight: "600",
                        fontSize: 13,
                      }}
                    >
                      {SUPPLEMENT_FREQUENCY_LABEL[f]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Time of day</Text>
            <View style={styles.chipRow}>
              {TIMES.map((t) => {
                const active = suppTime === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setSuppTime(t)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        borderColor: active ? colors.accent : colors.surfaceBorder,
                        backgroundColor: active ? colors.accent : "transparent",
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? colors.accentText : colors.text,
                        fontWeight: "600",
                        fontSize: 13,
                      }}
                    >
                      {TIME_OF_DAY_LABEL[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {suppFreq === "twice_weekly" ? (
            <View style={styles.field}>
              <Text style={styles.label}>Which two days?</Text>
              <View style={styles.chipRow}>
                {DAY_NAMES_SHORT.map((name, idx) => {
                  const active = suppDays.includes(idx);
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        if (active) {
                          setSuppDays(suppDays.filter((d) => d !== idx));
                        } else if (suppDays.length < 2) {
                          setSuppDays([...suppDays, idx]);
                        } else {
                          setSuppDays([suppDays[1], idx]);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          borderColor: active
                            ? colors.accent
                            : colors.surfaceBorder,
                          backgroundColor: active
                            ? colors.accent
                            : "transparent",
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? colors.accentText : colors.text,
                          fontWeight: "600",
                          fontSize: 13,
                        }}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {suppDays.length !== 2 ? (
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    marginTop: 6,
                  }}
                >
                  Pick exactly 2 days.
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.field}>
            <Text style={styles.label}>Start date</Text>
            <Pressable
              onPress={() => {
                if (Platform.OS === "android") openAndroidPicker();
                else setShowPicker(true);
              }}
              style={({ pressed }) => [
                styles.suppDateBtn,
                { borderColor: colors.surfaceBorder },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={colors.textMuted}
              />
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {suppStartDate.toLocaleDateString()}
              </Text>
            </Pressable>
            {Platform.OS === "ios" && showPicker ? (
              <View style={{ marginTop: 8 }}>
                <DateTimePicker
                  value={suppStartDate}
                  mode="date"
                  display="inline"
                  onChange={onIosDateChange}
                  themeVariant="light"
                />
              </View>
            ) : null}
          </View>
          <View style={styles.suppFormActions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.suppCancelBtn,
                { borderColor: colors.surfaceBorder },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                style={{ color: colors.textMuted, fontWeight: "600" }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={!suppName.trim()}
              style={({ pressed }) => [
                styles.suppSaveBtn,
                { backgroundColor: colors.accent },
                !suppName.trim() && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={{ color: colors.accentText, fontWeight: "700" }}
              >
                {suppFormId === "new" ? "Add supplement" : "Save changes"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addSuppBtn,
            { borderColor: colors.accent },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "700" }}>
            Add supplement
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function OptionRadio(props: {
  colors: Palette;
  styles: Styles;
  title: string;
  description: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors, styles, title, description, active, onPress } = props;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        {
          borderColor: active ? colors.accent : colors.surfaceBorder,
          backgroundColor: active ? colors.accent + "14" : colors.surface,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDesc}>{description}</Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={22}
        color={active ? colors.accent : colors.textSubtle}
      />
    </Pressable>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: 20, paddingBottom: 24, gap: 20 },

    heading: { color: c.text, fontSize: 28, fontWeight: "800" },
    sub: { color: c.textMuted, fontSize: 14, marginTop: 4 },

    section: { gap: 10 },
    sectionTitle: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    subLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginTop: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },

    field: {
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
    },
    label: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    labelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    textInput: { color: c.text, fontSize: 18, fontWeight: "600", padding: 0 },
    inputRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
    numInput: {
      color: c.text,
      fontSize: 22,
      fontWeight: "700",
      flex: 1,
      padding: 0,
    },
    inputUnit: { color: c.textSubtle, fontSize: 13, fontWeight: "600" },

    chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
    },

    toggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    toggleText: { fontSize: 12, fontWeight: "600", color: c.textMuted },

    bmiCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
    },
    bmiLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    bmiValue: { color: c.text, fontSize: 26, fontWeight: "800", marginTop: 2 },
    bmiChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    bmiChipText: { color: "#fff", fontSize: 13, fontWeight: "700" },

    infoCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
    },
    infoLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    infoValue: { color: c.text, fontSize: 16, fontWeight: "700" },

    warnCard: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: "#F59E0B",
    },
    warnTitle: { color: c.text, fontSize: 14, fontWeight: "700" },
    warnBody: { color: c.textMuted, fontSize: 13, lineHeight: 18 },

    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
    },
    optionTitle: { color: c.text, fontSize: 15, fontWeight: "700" },
    optionDesc: { color: c.textMuted, fontSize: 13, marginTop: 2 },

    recalcBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    recalcBtnText: { fontSize: 12, fontWeight: "700" },

    savedBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
    },

    suppListCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
    },
    suppListName: { fontSize: 15, fontWeight: "700" },
    suppListMeta: { fontSize: 12, marginTop: 2 },
    iconBtn: { padding: 4 },
    addSuppBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: "dashed",
    },
    suppDateBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    suppFormActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
    },
    suppCancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
    },
    suppSaveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },

    hintText: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    customRatioRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    customRatioLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.surfaceBorder,
    },
    totalLabel: { color: c.textMuted, fontSize: 12, fontWeight: "700" },
    totalValue: { fontSize: 16, fontWeight: "800" },

    dangerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#EF4444",
      backgroundColor: "transparent",
    },
    dangerBtnText: { color: "#EF4444", fontSize: 14, fontWeight: "700" },

    toast: {
      position: "absolute",
      left: 20,
      right: 20,
      bottom: 100,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: "#0F172A",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    toastText: { color: "#FFF", fontSize: 14, fontWeight: "700" },

    footer: { padding: 20, paddingTop: 8 },
    button: {
      backgroundColor: c.accent,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
    },
    buttonText: { color: c.accentText, fontSize: 16, fontWeight: "700" },
  });
