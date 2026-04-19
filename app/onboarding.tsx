import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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
  createSupplement,
  saveOnboardingProfile,
  serializeTwiceWeeklyDays,
} from "@/lib/db";
import type {
  SupplementFrequency,
  TimeOfDay,
} from "@/lib/db";
import {
  SUPPLEMENT_FREQUENCY_LABEL,
  TIME_OF_DAY_LABEL,
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
  computeMacros,
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
  timeframeFromCalories,
  weeklyKgChange,
} from "@/lib/nutrition";
import { Palette, useTheme } from "@/lib/theme";

type HeightUnit = "cm" | "ft_in";
type WeightUnit = "kg" | "lbs";
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type HouseholdOption = "just_me" | "create" | "join";

const TOTAL_STEPS = 7;

type OnboardingSupplement = {
  tempId: string;
  name: string;
  frequency: SupplementFrequency;
  time_of_day: TimeOfDay;
  start_date: string;
  twice_weekly_days: number[];
};

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

const DIET_STYLE_ORDER: DietStyle[] = [
  "balanced",
  "high_protein",
  "keto",
  "low_carb",
  "custom",
];

const FREQUENCY_OPTIONS: SupplementFrequency[] = [
  "daily",
  "twice_weekly",
  "weekly",
  "biweekly",
  "monthly",
];

const TIME_OF_DAY_OPTIONS: TimeOfDay[] = [
  "morning",
  "afternoon",
  "evening",
  "with_meal",
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

function generateHouseholdCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [name, setName] = useState("");
  const [ageStr, setAgeStr] = useState("30");
  const [gender, setGender] = useState<Gender | null>(null);
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("ft_in");
  const [heightCmStr, setHeightCmStr] = useState("170");
  const [heightFtStr, setHeightFtStr] = useState("5");
  const [heightInStr, setHeightInStr] = useState("7");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [weightStr, setWeightStr] = useState("150");

  // Step 2
  const [goalWeightStr, setGoalWeightStr] = useState("140");
  const [timeframeStr, setTimeframeStr] = useState("12");

  // Step 3
  const [activity, setActivity] = useState<ActivityLevel | null>(null);

  // Step 4
  const [composition, setComposition] = useState<CompositionGoal | null>(null);

  // Step 5 — diet style
  const [dietStyle, setDietStyle] = useState<DietStyle | null>(null);
  const [customProteinStr, setCustomProteinStr] = useState("30");
  const [customCarbsStr, setCustomCarbsStr] = useState("40");
  const [customFatStr, setCustomFatStr] = useState("30");

  // Step 6 — supplements
  const [supplements, setSupplements] = useState<OnboardingSupplement[]>([]);
  const [suppDraftOpen, setSuppDraftOpen] = useState(false);
  const [suppName, setSuppName] = useState("");
  const [suppFreq, setSuppFreq] = useState<SupplementFrequency>("daily");
  const [suppTime, setSuppTime] = useState<TimeOfDay>("morning");
  const [suppStartDate, setSuppStartDate] = useState(new Date());
  const [suppDays, setSuppDays] = useState<number[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Step 7 — household
  const [householdOption, setHouseholdOption] =
    useState<HouseholdOption | null>(null);
  const [householdCode, setHouseholdCode] = useState("");
  const [joinCodeStr, setJoinCodeStr] = useState("");

  // Result (editable)
  const [resultCal, setResultCal] = useState("0");
  const [resultProt, setResultProt] = useState("0");
  const [resultCarbs, setResultCarbs] = useState("0");
  const [resultFat, setResultFat] = useState("0");
  const [saving, setSaving] = useState(false);

  const heightCm =
    heightUnit === "cm"
      ? Number(heightCmStr) || 0
      : ftInToCm(Number(heightFtStr) || 0, Number(heightInStr) || 0);

  const weightKg =
    weightUnit === "kg"
      ? Number(weightStr) || 0
      : lbsToKg(Number(weightStr) || 0);

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

  const activeRatio: MacroRatio | null = useMemo(() => {
    if (!dietStyle) return null;
    if (dietStyle === "custom") return customRatio;
    return DIET_STYLES[dietStyle];
  }, [dietStyle, customRatio]);

  const availableCompositions = useMemo(
    () => allowedCompositions(weightKg, goalKg),
    [weightKg, goalKg],
  );

  const availableDietStyles = useMemo(
    () => allowedDietStyles(composition),
    [composition],
  );

  const pickComposition = (c: CompositionGoal) => {
    setComposition(c);
    if (c === "recomp") {
      setDietStyle("high_protein");
    } else if (dietStyle && !allowedDietStyles(c).includes(dietStyle)) {
      setDietStyle(null);
    }
  };

  useEffect(() => {
    if (composition && !availableCompositions.includes(composition)) {
      setComposition(null);
    }
  }, [availableCompositions, composition]);

  const computed = useMemo(() => {
    if (!gender || !activity || !composition || !dietStyle) return null;
    if (weightKg <= 0 || heightCm <= 0 || age <= 0) return null;
    return computeMacros({
      weightKg,
      heightCm,
      age,
      gender,
      activity,
      composition,
      weeklyKg,
      dietStyle,
      customRatio: dietStyle === "custom" ? customRatio : null,
    });
  }, [weightKg, heightCm, age, gender, activity, composition, weeklyKg, dietStyle, customRatio]);

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

  const step1Valid =
    name.trim().length > 0 &&
    age >= 13 &&
    age <= 120 &&
    !!gender &&
    heightCm >= 50 &&
    weightKg >= 20;
  const step2Valid = goalKg > 0 && timeframe > 0;
  const step3Valid = !!activity;
  const step4Valid = !!composition;
  const step5Valid =
    !!dietStyle && (dietStyle !== "custom" || customTotal === 100);
  const step6Valid = true; // supplements optional
  const step7Valid =
    householdOption === "just_me" ||
    householdOption === "create" ||
    (householdOption === "join" && joinCodeStr.trim().length === 6);

  const canNext =
    step === 1 ? step1Valid
      : step === 2 ? step2Valid
        : step === 3 ? step3Valid
          : step === 4 ? step4Valid
            : step === 5 ? step5Valid
              : step === 6 ? step6Valid
                : step === 7 ? step7Valid
                  : true;

  const commitDraftSupplementIfPending = (): OnboardingSupplement | null => {
    if (!suppDraftOpen || !suppName.trim()) return null;
    if (suppFreq === "twice_weekly" && suppDays.length !== 2) return null;
    const entry: OnboardingSupplement = {
      tempId: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      name: suppName.trim(),
      frequency: suppFreq,
      time_of_day: suppTime,
      start_date: localDateISO(suppStartDate),
      twice_weekly_days: suppFreq === "twice_weekly" ? suppDays : [],
    };
    setSupplements((prev) => [...prev, entry]);
    setSuppName("");
    setSuppFreq("daily");
    setSuppTime("morning");
    setSuppStartDate(new Date());
    setSuppDays([]);
    setSuppDraftOpen(false);
    return entry;
  };

  const handleNext = () => {
    if (!canNext) return;
    if (step === 6) {
      commitDraftSupplementIfPending();
    }
    if (step === 7) {
      if (computed) {
        setResultCal(String(computed.calories));
        setResultProt(String(computed.protein));
        setResultCarbs(String(computed.carbs));
        setResultFat(String(computed.fat));
      }
      setStep(8);
    } else if (step < 8) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleCaloriesChange = (v: string) => {
    const clean = v.replace(/[^0-9]/g, "");
    setResultCal(clean);
    if (!activeRatio || !composition || !computed) return;
    const cal = Number(clean) || 0;
    const m = rebalanceFromCalories(cal, activeRatio, weightKg, composition);
    setResultProt(String(m.protein));
    setResultCarbs(String(m.carbs));
    setResultFat(String(m.fat));
    const tf = timeframeFromCalories(computed.tdee, cal, weightKg, goalKg);
    if (tf != null) setTimeframeStr(String(tf));
  };

  const handleMacroChange = (
    which: "protein" | "carbs" | "fat",
    v: string,
  ) => {
    const clean = v.replace(/[^0-9]/g, "");
    if (which === "protein") setResultProt(clean);
    else if (which === "carbs") setResultCarbs(clean);
    else setResultFat(clean);
    if (!activeRatio) return;
    const current = {
      calories: Number(resultCal) || 0,
      protein: Number(resultProt) || 0,
      carbs: Number(resultCarbs) || 0,
      fat: Number(resultFat) || 0,
    };
    const newVal = Number(clean) || 0;
    const m = rebalanceMacro(current, which, newVal, activeRatio);
    if (which !== "protein") setResultProt(String(m.protein));
    if (which !== "carbs") setResultCarbs(String(m.carbs));
    if (which !== "fat") setResultFat(String(m.fat));
  };

  const handleAddSupplement = () => {
    if (!suppName.trim()) return;
    if (suppFreq === "twice_weekly" && suppDays.length !== 2) {
      Alert.alert(
        "Pick two days",
        "For a twice-a-week supplement, please select exactly two days of the week.",
      );
      return;
    }
    const entry: OnboardingSupplement = {
      tempId: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      name: suppName.trim(),
      frequency: suppFreq,
      time_of_day: suppTime,
      start_date: localDateISO(suppStartDate),
      twice_weekly_days: suppFreq === "twice_weekly" ? suppDays : [],
    };
    setSupplements((prev) => [...prev, entry]);
    setSuppName("");
    setSuppFreq("daily");
    setSuppTime("morning");
    setSuppStartDate(new Date());
    setSuppDays([]);
    setSuppDraftOpen(false);
  };

  const openAndroidDatePicker = () => {
    DateTimePickerAndroid.open({
      value: suppStartDate,
      mode: "date",
      onChange: (_event, selected) => {
        if (selected) setSuppStartDate(selected);
      },
    });
  };

  const onIosDateChange = (
    _event: DateTimePickerEvent,
    selected?: Date,
  ) => {
    if (selected) setSuppStartDate(selected);
  };

  const handleCreateHousehold = () => {
    setHouseholdOption("create");
    if (!householdCode) setHouseholdCode(generateHouseholdCode());
  };

  const handleFinish = async () => {
    if (!gender || !activity || !composition || !dietStyle) return;
    setSaving(true);
    const draftValid =
      suppDraftOpen &&
      suppName.trim() &&
      (suppFreq !== "twice_weekly" || suppDays.length === 2);
    const pendingDraft: OnboardingSupplement[] = draftValid
      ? [
          {
            tempId: "draft",
            name: suppName.trim(),
            frequency: suppFreq,
            time_of_day: suppTime,
            start_date: localDateISO(suppStartDate),
            twice_weekly_days: suppFreq === "twice_weekly" ? suppDays : [],
          },
        ]
      : [];
    const allSupplements = [...supplements, ...pendingDraft];
    try {
      const houseCode =
        householdOption === "create"
          ? householdCode
          : householdOption === "join"
            ? joinCodeStr.trim()
            : null;
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
        daily_calorie_goal: Number(resultCal) || 0,
        daily_protein_goal: Number(resultProt) || 0,
        daily_carbs_goal: Number(resultCarbs) || 0,
        daily_fat_goal: Number(resultFat) || 0,
        diet_style: dietStyle,
        protein_pct: activeRatio?.proteinPct ?? null,
        carbs_pct: activeRatio?.carbsPct ?? null,
        fat_pct: activeRatio?.fatPct ?? null,
        household_code: houseCode,
      });
      for (const s of allSupplements) {
        try {
          await createSupplement({
            name: s.name,
            brand: null,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            micronutrients: null,
            frequency: s.frequency,
            time_of_day: s.time_of_day,
            start_date: s.start_date,
            twice_weekly_days:
              s.frequency === "twice_weekly"
                ? serializeTwiceWeeklyDays(s.twice_weekly_days)
                : null,
          });
        } catch (err) {
          console.error("Failed to save supplement", s.name, err);
          throw err;
        }
      }
      router.replace("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Could not save", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.topBar}>
          <StepIndicator step={step} total={TOTAL_STEPS} colors={colors} />
          <Text style={styles.stepLabel}>
            {step === 8 ? "Results" : `Step ${step} of ${TOTAL_STEPS}`}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <Step1
              colors={colors}
              styles={styles}
              name={name}
              setName={setName}
              ageStr={ageStr}
              setAgeStr={setAgeStr}
              gender={gender}
              setGender={setGender}
              heightUnit={heightUnit}
              toggleHeightUnit={toggleHeightUnit}
              heightCmStr={heightCmStr}
              setHeightCmStr={setHeightCmStr}
              heightFtStr={heightFtStr}
              setHeightFtStr={setHeightFtStr}
              heightInStr={heightInStr}
              setHeightInStr={setHeightInStr}
              weightUnit={weightUnit}
              toggleWeightUnit={toggleWeightUnit}
              weightStr={weightStr}
              setWeightStr={setWeightStr}
              bmiValue={bmiValue}
              bmiCat={bmiCat}
            />
          )}
          {step === 2 && (
            <Step2
              colors={colors}
              styles={styles}
              weightUnit={weightUnit}
              weightKg={weightKg}
              heightCm={heightCm}
              goalKg={goalKg}
              age={age}
              gender={gender}
              goalWeightStr={goalWeightStr}
              setGoalWeightStr={setGoalWeightStr}
              timeframeStr={timeframeStr}
              setTimeframeStr={setTimeframeStr}
              weeklyKg={weeklyKg}
            />
          )}
          {step === 3 && (
            <Step3
              colors={colors}
              styles={styles}
              activity={activity}
              setActivity={setActivity}
            />
          )}
          {step === 4 && (
            <Step4
              colors={colors}
              styles={styles}
              composition={composition}
              setComposition={pickComposition}
              allowedCompositions={availableCompositions}
            />
          )}
          {step === 5 && (
            <Step5
              colors={colors}
              styles={styles}
              dietStyle={dietStyle}
              setDietStyle={setDietStyle}
              customProteinStr={customProteinStr}
              setCustomProteinStr={setCustomProteinStr}
              customCarbsStr={customCarbsStr}
              setCustomCarbsStr={setCustomCarbsStr}
              customFatStr={customFatStr}
              setCustomFatStr={setCustomFatStr}
              customTotal={customTotal}
              allowedStyles={availableDietStyles}
              weightKg={weightKg}
              estimatedCalories={computed?.calories ?? 0}
              composition={composition}
            />
          )}
          {step === 6 && (
            <Step6
              colors={colors}
              styles={styles}
              supplements={supplements}
              removeSupplement={(id) =>
                setSupplements((prev) => prev.filter((s) => s.tempId !== id))
              }
              draftOpen={suppDraftOpen}
              setDraftOpen={setSuppDraftOpen}
              suppName={suppName}
              setSuppName={setSuppName}
              suppFreq={suppFreq}
              setSuppFreq={setSuppFreq}
              suppTime={suppTime}
              setSuppTime={setSuppTime}
              suppStartDate={suppStartDate}
              setSuppStartDate={setSuppStartDate}
              suppDays={suppDays}
              setSuppDays={setSuppDays}
              showDatePicker={showDatePicker}
              setShowDatePicker={setShowDatePicker}
              openAndroidDatePicker={openAndroidDatePicker}
              onIosDateChange={onIosDateChange}
              handleAddSupplement={handleAddSupplement}
            />
          )}
          {step === 7 && (
            <Step7
              colors={colors}
              styles={styles}
              householdOption={householdOption}
              setHouseholdOption={setHouseholdOption}
              householdCode={householdCode}
              onCreate={handleCreateHousehold}
              joinCodeStr={joinCodeStr}
              setJoinCodeStr={setJoinCodeStr}
            />
          )}
          {step === 8 && (
            <Result
              colors={colors}
              styles={styles}
              computed={computed}
              dietStyle={dietStyle}
              gender={gender}
              weightKg={weightKg}
              composition={composition}
              activeRatio={activeRatio}
              resultCal={resultCal}
              resultProt={resultProt}
              resultCarbs={resultCarbs}
              resultFat={resultFat}
              handleCaloriesChange={handleCaloriesChange}
              handleMacroChange={handleMacroChange}
              timeframeStr={timeframeStr}
              name={name}
            />
          )}
        </ScrollView>

        <View style={styles.footer}>
          {step > 1 ? (
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={18}
                color={colors.textMuted}
              />
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backBtn} />
          )}
          {step === 8 ? (
            <Pressable
              onPress={handleFinish}
              disabled={saving}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.85 },
                saving && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {saving ? "Saving…" : "Looks good, let's start"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleNext}
              disabled={!canNext}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.85 },
                !canNext && { opacity: 0.4 },
              ]}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepIndicator({
  step,
  total,
  colors,
}: {
  step: Step;
  total: number;
  colors: Palette;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 4, flex: 1 }}>
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const active = step === 8 ? true : n <= step;
        return (
          <View
            key={n}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: active ? colors.accent : colors.surfaceBorder,
            }}
          />
        );
      })}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Step1(props: {
  colors: Palette;
  styles: Styles;
  name: string;
  setName: (s: string) => void;
  ageStr: string;
  setAgeStr: (s: string) => void;
  gender: Gender | null;
  setGender: (g: Gender) => void;
  heightUnit: HeightUnit;
  toggleHeightUnit: () => void;
  heightCmStr: string;
  setHeightCmStr: (s: string) => void;
  heightFtStr: string;
  setHeightFtStr: (s: string) => void;
  heightInStr: string;
  setHeightInStr: (s: string) => void;
  weightUnit: WeightUnit;
  toggleWeightUnit: () => void;
  weightStr: string;
  setWeightStr: (s: string) => void;
  bmiValue: number;
  bmiCat: BmiCategory;
}) {
  const { colors, styles, bmiValue, bmiCat } = props;
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>Let&apos;s get to know you</Text>
        <Text style={styles.subtitle}>A few basics to personalize your plan.</Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.textInput}
          value={props.name}
          onChangeText={props.setName}
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
            value={props.ageStr}
            onChangeText={(v) => props.setAgeStr(v.replace(/[^0-9]/g, ""))}
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
            const active = props.gender === g.value;
            return (
              <Pressable
                key={g.value}
                onPress={() => props.setGender(g.value)}
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
      <View style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Height</Text>
          <Pressable
            onPress={props.toggleHeightUnit}
            hitSlop={8}
            style={({ pressed }) => [
              styles.toggle,
              { borderColor: colors.surfaceBorder },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.toggleText, { color: colors.textMuted }]}>
              {props.heightUnit === "cm" ? "cm" : "ft / in"}
            </Text>
            <Ionicons name="swap-horizontal" size={12} color={colors.textMuted} />
          </Pressable>
        </View>
        {props.heightUnit === "cm" ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.numInput}
              value={props.heightCmStr}
              onChangeText={(v) => props.setHeightCmStr(v.replace(/[^0-9.]/g, ""))}
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
              value={props.heightFtStr}
              onChangeText={(v) => props.setHeightFtStr(v.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              maxLength={1}
              selectionColor={colors.accent}
            />
            <Text style={styles.inputUnit}>ft</Text>
            <TextInput
              style={[styles.numInput, { flex: 0, width: 60, marginLeft: 12 }]}
              value={props.heightInStr}
              onChangeText={(v) => props.setHeightInStr(v.replace(/[^0-9]/g, ""))}
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
            onPress={props.toggleWeightUnit}
            hitSlop={8}
            style={({ pressed }) => [
              styles.toggle,
              { borderColor: colors.surfaceBorder },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.toggleText, { color: colors.textMuted }]}>
              {props.weightUnit}
            </Text>
            <Ionicons name="swap-horizontal" size={12} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={props.weightStr}
            onChangeText={(v) => props.setWeightStr(v.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            maxLength={5}
            selectionColor={colors.accent}
          />
          <Text style={styles.inputUnit}>{props.weightUnit}</Text>
        </View>
      </View>
      {bmiValue > 0 ? (
        <View
          style={[
            styles.bmiCard,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <View>
            <Text style={[styles.bmiLabel, { color: colors.textMuted }]}>
              Your BMI
            </Text>
            <Text style={[styles.bmiValue, { color: colors.text }]}>
              {bmiValue.toFixed(1)}
            </Text>
          </View>
          <View style={[styles.bmiChip, { backgroundColor: BMI_COLOR[bmiCat] }]}>
            <Text style={styles.bmiChipText}>{BMI_LABEL[bmiCat]}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Step2(props: {
  colors: Palette;
  styles: Styles;
  weightUnit: WeightUnit;
  weightKg: number;
  heightCm: number;
  goalKg: number;
  age: number;
  gender: Gender | null;
  goalWeightStr: string;
  setGoalWeightStr: (s: string) => void;
  timeframeStr: string;
  setTimeframeStr: (s: string) => void;
  weeklyKg: number;
}) {
  const { colors, styles, weeklyKg, weightKg, heightCm, gender, age } = props;

  const ideal = idealWeightRangeKg(heightCm);
  const formatWeight = (kg: number) =>
    props.weightUnit === "kg"
      ? kg.toFixed(1)
      : String(Math.round(kgToLbs(kg)));
  const weightUnitLabel = props.weightUnit;

  const estTdee = gender
    ? bmr({ weightKg, heightCm, age, gender }) *
      ACTIVITY_MULTIPLIERS.moderate
    : 0;
  const minCal = gender ? calorieFloor(gender, weightKg) : 0;
  const maxKgPerWeek = estTdee > 0 ? maxWeeklyLossKg(estTdee, minCal) : 0;
  const maxRateDisplay =
    props.weightUnit === "kg"
      ? `${maxKgPerWeek.toFixed(2)} kg/week`
      : `${kgToLbs(maxKgPerWeek).toFixed(1)} lbs/week`;

  const requiredCal =
    estTdee > 0 ? requiredCaloriesForRate(estTdee, weeklyKg) : 0;
  const tooFast = gender && weeklyKg > 0 && requiredCal < minCal;

  const weeklyDisplay =
    props.weightUnit === "kg"
      ? `${weeklyKg.toFixed(2)} kg/week`
      : `${kgToLbs(weeklyKg).toFixed(1)} lbs/week`;

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>Set your goal</Text>
        <Text style={styles.subtitle}>
          What weight are you aiming for, and by when?
        </Text>
      </View>

      {heightCm > 0 ? (
        <Text style={[styles.warnBody, { color: colors.textMuted }]}>
          Based on your height, your ideal weight range is{" "}
          {formatWeight(ideal.minKg)}–{formatWeight(ideal.maxKg)}{" "}
          {weightUnitLabel}.
        </Text>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Goal weight</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={props.goalWeightStr}
            onChangeText={(v) =>
              props.setGoalWeightStr(v.replace(/[^0-9.]/g, ""))
            }
            keyboardType="decimal-pad"
            maxLength={5}
            selectionColor={colors.accent}
          />
          <Text style={styles.inputUnit}>{props.weightUnit}</Text>
        </View>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Timeframe</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.numInput}
            value={props.timeframeStr}
            onChangeText={(v) => props.setTimeframeStr(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            maxLength={3}
            selectionColor={colors.accent}
          />
          <Text style={styles.inputUnit}>weeks</Text>
        </View>
      </View>

      <View
        style={[
          styles.infoCard,
          { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
        ]}
      >
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>
          {weeklyKg > 0 ? "Weekly loss rate" : weeklyKg < 0 ? "Weekly gain rate" : "Maintenance"}
        </Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>
          {weeklyKg === 0 ? "—" : weeklyDisplay}
        </Text>
      </View>

      {estTdee > 0 ? (
        <Text style={[styles.warnBody, { color: colors.textMuted }]}>
          Your fastest safe weight loss rate is {maxRateDisplay}.
        </Text>
      ) : null}

      {tooFast ? (
        <View
          style={[
            styles.warnCard,
            { backgroundColor: colors.surface, borderColor: "#EF4444" },
          ]}
        >
          <Ionicons name="warning" size={18} color="#EF4444" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.warnTitle, { color: colors.text }]}>
              Too fast
            </Text>
            <Text style={[styles.warnBody, { color: colors.textMuted }]}>
              This would require eating below your minimum safe calories of{" "}
              {minCal} cal. Try a longer timeframe.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Step3(props: {
  colors: Palette;
  styles: Styles;
  activity: ActivityLevel | null;
  setActivity: (a: ActivityLevel) => void;
}) {
  const { colors, styles } = props;
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>How active are you?</Text>
        <Text style={styles.subtitle}>
          We&apos;ll use this to estimate your daily burn.
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        {ACTIVITY_OPTIONS.map((opt) => (
          <OptionRadio
            key={opt.value}
            colors={colors}
            styles={styles}
            title={opt.title}
            description={opt.description}
            active={props.activity === opt.value}
            onPress={() => props.setActivity(opt.value)}
          />
        ))}
      </View>
    </View>
  );
}

function Step4(props: {
  colors: Palette;
  styles: Styles;
  composition: CompositionGoal | null;
  setComposition: (c: CompositionGoal) => void;
  allowedCompositions: CompositionGoal[];
}) {
  const { colors, styles } = props;
  const options = COMPOSITION_OPTIONS.filter((opt) =>
    props.allowedCompositions.includes(opt.value),
  );
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>What&apos;s your goal?</Text>
        <Text style={styles.subtitle}>Pick the outcome you&apos;re after.</Text>
      </View>
      <View style={{ gap: 10 }}>
        {options.map((opt) => (
          <OptionRadio
            key={opt.value}
            colors={colors}
            styles={styles}
            title={opt.title}
            description={opt.description}
            active={props.composition === opt.value}
            onPress={() => props.setComposition(opt.value)}
          />
        ))}
      </View>
    </View>
  );
}

function Step5(props: {
  colors: Palette;
  styles: Styles;
  dietStyle: DietStyle | null;
  setDietStyle: (d: DietStyle) => void;
  customProteinStr: string;
  setCustomProteinStr: (s: string) => void;
  customCarbsStr: string;
  setCustomCarbsStr: (s: string) => void;
  customFatStr: string;
  setCustomFatStr: (s: string) => void;
  customTotal: number;
  allowedStyles: DietStyle[];
  weightKg: number;
  estimatedCalories: number;
  composition: CompositionGoal | null;
}) {
  const { colors, styles, dietStyle, customTotal, weightKg, estimatedCalories, composition } = props;
  const customValid = customTotal === 100;
  const visibleStyles = DIET_STYLE_ORDER.filter((s) =>
    props.allowedStyles.includes(s),
  );

  const cal = estimatedCalories;
  const minProteinG = weightKg * minProteinGramsPerKg(composition ?? "lose_fat");
  const minFatG = weightKg * MIN_FAT_PER_KG;
  const minProteinPct = cal > 0 ? Math.ceil((minProteinG * 4 * 100) / cal) : 0;
  const minFatPct = cal > 0 ? Math.ceil((minFatG * 9 * 100) / cal) : 0;
  const currentProteinPct = Number(props.customProteinStr) || 0;
  const currentFatPct = Number(props.customFatStr) || 0;
  const proteinBelow = currentProteinPct < minProteinPct;
  const fatBelow = currentFatPct < minFatPct;

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>Choose a diet style</Text>
        <Text style={styles.subtitle}>
          We&apos;ll use this ratio to split your calories across macros.
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        {visibleStyles.map((style) => {
          const active = dietStyle === style;
          const label = dietStyleLabel(style);
          const description =
            style === "custom"
              ? "Set your own protein / carbs / fat split"
              : DIET_STYLES[style].description;
          return (
            <OptionRadio
              key={style}
              colors={colors}
              styles={styles}
              title={label}
              description={description}
              active={active}
              onPress={() => props.setDietStyle(style)}
            />
          );
        })}
      </View>
      {dietStyle === "custom" ? (
        <View style={styles.field}>
          <Text style={styles.label}>Custom ratio (total must be 100%)</Text>
          <View style={styles.customRatioRow}>
            <View style={styles.customRatioItem}>
              <Text style={styles.customRatioLabel}>Protein</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={props.customProteinStr}
                  onChangeText={(v) =>
                    props.setCustomProteinStr(v.replace(/[^0-9]/g, ""))
                  }
                  keyboardType="number-pad"
                  maxLength={3}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>%</Text>
              </View>
            </View>
            <View style={styles.customRatioItem}>
              <Text style={styles.customRatioLabel}>Carbs</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={props.customCarbsStr}
                  onChangeText={(v) =>
                    props.setCustomCarbsStr(v.replace(/[^0-9]/g, ""))
                  }
                  keyboardType="number-pad"
                  maxLength={3}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>%</Text>
              </View>
            </View>
            <View style={styles.customRatioItem}>
              <Text style={styles.customRatioLabel}>Fat</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={props.customFatStr}
                  onChangeText={(v) =>
                    props.setCustomFatStr(v.replace(/[^0-9]/g, ""))
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
                { color: customValid ? "#22C55E" : "#EF4444" },
              ]}
            >
              {customTotal}%
            </Text>
          </View>
          {proteinBelow && cal > 0 ? (
            <Text style={{ color: "#F59E0B", fontSize: 12, marginTop: 4 }}>
              Minimum protein: {Math.round(minProteinG)} g
              {minProteinPct ? ` (≈ ${minProteinPct}%)` : ""}
            </Text>
          ) : null}
          {fatBelow && cal > 0 ? (
            <Text style={{ color: "#F59E0B", fontSize: 12, marginTop: 2 }}>
              Minimum fat: {Math.round(minFatG)} g
              {minFatPct ? ` (≈ ${minFatPct}%)` : ""}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Step6(props: {
  colors: Palette;
  styles: Styles;
  supplements: OnboardingSupplement[];
  removeSupplement: (id: string) => void;
  draftOpen: boolean;
  setDraftOpen: (b: boolean) => void;
  suppName: string;
  setSuppName: (s: string) => void;
  suppFreq: SupplementFrequency;
  setSuppFreq: (f: SupplementFrequency) => void;
  suppTime: TimeOfDay;
  setSuppTime: (t: TimeOfDay) => void;
  suppStartDate: Date;
  setSuppStartDate: (d: Date) => void;
  suppDays: number[];
  setSuppDays: (d: number[]) => void;
  showDatePicker: boolean;
  setShowDatePicker: (b: boolean) => void;
  openAndroidDatePicker: () => void;
  onIosDateChange: (e: DateTimePickerEvent, d?: Date) => void;
  handleAddSupplement: () => void;
}) {
  const { colors, styles } = props;
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>Supplements &amp; Medications</Text>
        <Text style={styles.subtitle}>
          Track vitamins, supplements, or medications. You can skip this.
        </Text>
      </View>

      {props.supplements.length > 0 ? (
        <View style={{ gap: 10 }}>
          {props.supplements.map((s) => (
            <View
              key={s.tempId}
              style={[
                styles.suppCard,
                { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.suppName, { color: colors.text }]}>
                  {s.name}
                </Text>
                <Text style={[styles.suppMeta, { color: colors.textMuted }]}>
                  {SUPPLEMENT_FREQUENCY_LABEL[s.frequency]} ·{" "}
                  {TIME_OF_DAY_LABEL[s.time_of_day]} · starts {s.start_date}
                </Text>
              </View>
              <Pressable
                onPress={() => props.removeSupplement(s.tempId)}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: 0.5 }}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {!props.draftOpen ? (
        <Pressable
          onPress={() => props.setDraftOpen(true)}
          style={({ pressed }) => [
            styles.addSuppBtn,
            { borderColor: colors.accent },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={[styles.addSuppBtnText, { color: colors.accent }]}>
            {props.supplements.length === 0
              ? "Add a supplement"
              : "Add another"}
          </Text>
        </Pressable>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={props.suppName}
              onChangeText={props.setSuppName}
              placeholder="e.g. Multivitamin"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.accent}
              maxLength={60}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Frequency</Text>
            <View style={styles.chipRow}>
              {FREQUENCY_OPTIONS.map((f) => {
                const active = props.suppFreq === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => props.setSuppFreq(f)}
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
              {TIME_OF_DAY_OPTIONS.map((t) => {
                const active = props.suppTime === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => props.setSuppTime(t)}
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
          {props.suppFreq === "twice_weekly" ? (
            <View style={styles.field}>
              <Text style={styles.label}>Which two days?</Text>
              <View style={styles.chipRow}>
                {DAY_NAMES_SHORT.map((name, idx) => {
                  const active = props.suppDays.includes(idx);
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        if (active) {
                          props.setSuppDays(
                            props.suppDays.filter((d) => d !== idx),
                          );
                        } else if (props.suppDays.length < 2) {
                          props.setSuppDays([...props.suppDays, idx]);
                        } else {
                          props.setSuppDays([props.suppDays[1], idx]);
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
              {props.suppDays.length !== 2 ? (
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
                if (Platform.OS === "android") props.openAndroidDatePicker();
                else props.setShowDatePicker(true);
              }}
              style={({ pressed }) => [
                styles.dateBtn,
                { borderColor: colors.surfaceBorder },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.dateBtnText, { color: colors.text }]}>
                {props.suppStartDate.toLocaleDateString()}
              </Text>
            </Pressable>
            {Platform.OS === "ios" && props.showDatePicker ? (
              <View style={{ marginTop: 8 }}>
                <DateTimePicker
                  value={props.suppStartDate}
                  mode="date"
                  display="inline"
                  onChange={props.onIosDateChange}
                  themeVariant={colors.background === "#FFFFFF" ? "light" : "dark"}
                />
              </View>
            ) : null}
          </View>
          <View style={styles.draftActions}>
            <Pressable
              onPress={() => props.setDraftOpen(false)}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: colors.surfaceBorder },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={props.handleAddSupplement}
              disabled={!props.suppName.trim()}
              style={({ pressed }) => [
                styles.saveSuppBtn,
                { backgroundColor: colors.accent },
                pressed && { opacity: 0.85 },
                !props.suppName.trim() && { opacity: 0.4 },
              ]}
            >
              <Text style={[styles.saveSuppBtnText, { color: colors.accentText }]}>
                Add supplement
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Step7(props: {
  colors: Palette;
  styles: Styles;
  householdOption: HouseholdOption | null;
  setHouseholdOption: (h: HouseholdOption) => void;
  householdCode: string;
  onCreate: () => void;
  joinCodeStr: string;
  setJoinCodeStr: (s: string) => void;
}) {
  const { colors, styles } = props;
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>Do you cook for others?</Text>
        <Text style={styles.subtitle}>
          Your meal log stays private. Only pantry and cooked meals are shared.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <OptionRadio
          colors={colors}
          styles={styles}
          title="Just me"
          description="Use EzDiet solo — no sharing"
          active={props.householdOption === "just_me"}
          onPress={() => props.setHouseholdOption("just_me")}
        />
        <OptionRadio
          colors={colors}
          styles={styles}
          title="Create household"
          description="Generate a 6-digit code others can join"
          active={props.householdOption === "create"}
          onPress={props.onCreate}
        />
        <OptionRadio
          colors={colors}
          styles={styles}
          title="Join household"
          description="Enter an existing 6-digit code"
          active={props.householdOption === "join"}
          onPress={() => props.setHouseholdOption("join")}
        />
      </View>

      {props.householdOption === "create" && props.householdCode ? (
        <View
          style={[
            styles.codeCard,
            { backgroundColor: colors.surface, borderColor: colors.accent },
          ]}
        >
          <Text style={[styles.codeLabel, { color: colors.textMuted }]}>
            Your household code
          </Text>
          <Text style={[styles.codeValue, { color: colors.accent }]}>
            {props.householdCode}
          </Text>
          <Text style={[styles.codeHint, { color: colors.textSubtle }]}>
            Share this with your household members.
          </Text>
        </View>
      ) : null}

      {props.householdOption === "join" ? (
        <View style={styles.field}>
          <Text style={styles.label}>Household code</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.numInput}
              value={props.joinCodeStr}
              onChangeText={(v) =>
                props.setJoinCodeStr(v.replace(/[^0-9]/g, ""))
              }
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.accent}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Result(props: {
  colors: Palette;
  styles: Styles;
  computed: ReturnType<typeof computeMacros> | null;
  dietStyle: DietStyle | null;
  gender: Gender | null;
  weightKg: number;
  composition: CompositionGoal | null;
  activeRatio: MacroRatio | null;
  resultCal: string;
  resultProt: string;
  resultCarbs: string;
  resultFat: string;
  handleCaloriesChange: (v: string) => void;
  handleMacroChange: (which: "protein" | "carbs" | "fat", v: string) => void;
  timeframeStr: string;
  name: string;
}) {
  const { colors, styles, computed, dietStyle, gender, weightKg, name, composition, activeRatio } = props;
  const calNum = Number(props.resultCal) || 0;
  const floor = gender ? calorieFloor(gender, weightKg) : 1500;
  const belowFloor = calNum > 0 && calNum < floor;
  const liveAdjustment =
    composition && activeRatio && calNum > 0 && weightKg > 0
      ? macrosFromCaloriesAndRatio(calNum, activeRatio, weightKg, composition)
      : null;
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>
          Your plan{name.trim() ? `, ${name.trim().split(" ")[0]}` : ""}
        </Text>
        <Text style={styles.subtitle}>
          These are your daily targets. Tweak any number if you&apos;d like.
        </Text>
      </View>

      {computed ? (
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
          ]}
        >
          <SummaryCell label="BMR" value={computed.bmr} unit="kcal" styles={styles} colors={colors} />
          <View style={[styles.summaryDivider, { backgroundColor: colors.surfaceBorder }]} />
          <SummaryCell label="TDEE" value={computed.tdee} unit="kcal" styles={styles} colors={colors} />
          <View style={[styles.summaryDivider, { backgroundColor: colors.surfaceBorder }]} />
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Style</Text>
            <Text style={[styles.summaryValue, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>
              {dietStyle ? dietStyleLabel(dietStyle) : "—"}
            </Text>
            <Text style={[styles.summaryUnit, { color: colors.textSubtle }]}>
              {props.timeframeStr} weeks
            </Text>
          </View>
        </View>
      ) : null}

      {belowFloor ? (
        <View
          style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: "#EF4444" }]}
        >
          <Ionicons name="warning" size={18} color="#EF4444" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.warnTitle, { color: colors.text }]}>
              Calorie goal is very low
            </Text>
            <Text style={[styles.warnBody, { color: colors.textMuted }]}>
              Consuming fewer than {floor} kcal per day is not recommended for
              your body. Consider raising calories or extending your timeframe.
            </Text>
          </View>
        </View>
      ) : null}

      {liveAdjustment?.insufficient ? (
        <View
          style={[styles.warnCard, { backgroundColor: colors.surface, borderColor: "#EF4444" }]}
        >
          <Ionicons name="warning" size={18} color="#EF4444" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.warnTitle, { color: colors.text }]}>
              Calorie target too low
            </Text>
            <Text style={[styles.warnBody, { color: colors.textMuted }]}>
              Your calorie target is too low for this diet at your weight.
            </Text>
          </View>
        </View>
      ) : liveAdjustment?.adjusted ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Adjusted to meet your minimum protein/fat needs.
        </Text>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={styles.field}>
          <Text style={styles.label}>Daily Calories</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.numInput}
              value={props.resultCal}
              onChangeText={props.handleCaloriesChange}
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
              value={props.resultProt}
              onChangeText={(v) => props.handleMacroChange("protein", v)}
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
              value={props.resultCarbs}
              onChangeText={(v) => props.handleMacroChange("carbs", v)}
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
              value={props.resultFat}
              onChangeText={(v) => props.handleMacroChange("fat", v)}
              keyboardType="number-pad"
              maxLength={4}
              selectionColor={colors.accent}
            />
            <Text style={styles.inputUnit}>g</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function SummaryCell(props: {
  label: string;
  value: number;
  unit: string;
  styles: Styles;
  colors: Palette;
}) {
  const { label, value, unit, styles, colors } = props;
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.summaryUnit, { color: colors.textSubtle }]}>{unit}</Text>
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
        <Text style={[styles.optionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
          {description}
        </Text>
      </View>
      <Ionicons
        name={active ? "radio-button-on" : "radio-button-off"}
        size={22}
        color={active ? colors.accent : colors.textSubtle}
      />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: c.background },
    topBar: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 12,
      gap: 8,
    },
    stepLabel: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    scroll: { paddingHorizontal: 24, paddingBottom: 32 },
    title: { color: c.text, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
    subtitle: { color: c.textMuted, fontSize: 14, marginTop: 4 },

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
      fontSize: 24,
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
    toggleText: { fontSize: 12, fontWeight: "600" },

    bmiCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
    },
    bmiLabel: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    bmiValue: { fontSize: 28, fontWeight: "800", marginTop: 2 },
    bmiChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    bmiChipText: { color: "#fff", fontSize: 13, fontWeight: "700" },

    infoCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
    },
    infoLabel: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    infoValue: { fontSize: 18, fontWeight: "700" },

    warnCard: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
    },
    warnTitle: { fontSize: 14, fontWeight: "700" },
    warnBody: { fontSize: 13, lineHeight: 18 },

    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
    },
    optionTitle: { fontSize: 15, fontWeight: "700" },
    optionDesc: { fontSize: 13, marginTop: 2 },

    summaryCard: {
      flexDirection: "row",
      borderRadius: 14,
      borderWidth: 1,
      overflow: "hidden",
    },
    summaryCell: { flex: 1, padding: 14, alignItems: "center", gap: 2 },
    summaryDivider: { width: 1 },
    summaryLabel: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    summaryValue: { fontSize: 22, fontWeight: "800" },
    summaryUnit: { fontSize: 11 },

    customRatioRow: { flexDirection: "row", gap: 10, marginTop: 4 },
    customRatioItem: { flex: 1 },
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

    suppCard: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      gap: 12,
    },
    suppName: { fontSize: 15, fontWeight: "700" },
    suppMeta: { fontSize: 12, marginTop: 2 },
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
    addSuppBtnText: { fontSize: 14, fontWeight: "700" },

    dateBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      alignSelf: "flex-start",
    },
    dateBtnText: { fontSize: 14, fontWeight: "600" },

    draftActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
    },
    cancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
    },
    cancelBtnText: { fontSize: 13, fontWeight: "600" },
    saveSuppBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    saveSuppBtnText: { fontSize: 13, fontWeight: "700" },

    codeCard: {
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      alignItems: "center",
      gap: 4,
    },
    codeLabel: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    codeValue: { fontSize: 36, fontWeight: "800", letterSpacing: 4 },
    codeHint: { fontSize: 12, marginTop: 4 },

    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 8,
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingVertical: 12,
      paddingHorizontal: 8,
      minWidth: 80,
    },
    backBtnText: { color: c.textMuted, fontSize: 14, fontWeight: "600" },
    primaryBtn: {
      flex: 1,
      backgroundColor: c.accent,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
    },
    primaryBtnText: { color: c.accentText, fontSize: 16, fontWeight: "700" },
  });
