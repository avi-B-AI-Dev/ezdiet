import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
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

import { saveOnboardingProfile } from "@/lib/db";
import {
  type ActivityLevel,
  type BmiCategory,
  type CompositionGoal,
  type Gender,
  bmi,
  bmiCategory,
  cmToFtIn,
  computeMacros,
  ftInToCm,
  healthyTimelineRangeWeeks,
  kgToLbs,
  lbsToKg,
  weeklyKgChange,
} from "@/lib/nutrition";
import { Palette, useTheme } from "@/lib/theme";

type HeightUnit = "cm" | "ft_in";
type WeightUnit = "kg" | "lbs";
type Step = 1 | 2 | 3 | 4 | 5;

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
  {
    value: "sedentary",
    title: "Sedentary",
    description: "Desk job, little exercise",
  },
  {
    value: "light",
    title: "Lightly Active",
    description: "Light exercise 1-3 days/week",
  },
  {
    value: "moderate",
    title: "Moderately Active",
    description: "Moderate exercise 3-5 days/week",
  },
  {
    value: "very_active",
    title: "Very Active",
    description: "Hard exercise 6-7 days/week",
  },
];

const COMPOSITION_OPTIONS: {
  value: CompositionGoal;
  title: string;
  description: string;
}[] = [
  {
    value: "lose_fat",
    title: "Lose fat",
    description: "Reduce body fat while keeping muscle",
  },
  {
    value: "build_muscle",
    title: "Build muscle",
    description: "Gain lean mass with a slight surplus",
  },
  {
    value: "maintain",
    title: "Maintain weight",
    description: "Stay where you are",
  },
  {
    value: "recomp",
    title: "Body recomposition",
    description: "Lose fat and build muscle simultaneously",
  },
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

  const computed = useMemo(() => {
    if (!gender || !activity || !composition) return null;
    if (weightKg <= 0 || heightCm <= 0 || age <= 0) return null;
    return computeMacros({
      weightKg,
      heightCm,
      age,
      gender,
      activity,
      composition,
      weeklyKg,
    });
  }, [weightKg, heightCm, age, gender, activity, composition, weeklyKg]);

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

  const canNext =
    step === 1
      ? step1Valid
      : step === 2
        ? step2Valid
        : step === 3
          ? step3Valid
          : step === 4
            ? step4Valid
            : true;

  const handleNext = () => {
    if (!canNext) return;
    if (step === 4) {
      if (computed) {
        setResultCal(String(computed.calories));
        setResultProt(String(computed.protein));
        setResultCarbs(String(computed.carbs));
        setResultFat(String(computed.fat));
      }
      setStep(5);
    } else if (step < 5) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleFinish = async () => {
    if (!gender || !activity || !composition) return;
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
        daily_calorie_goal: Number(resultCal) || 0,
        daily_protein_goal: Number(resultProt) || 0,
        daily_carbs_goal: Number(resultCarbs) || 0,
        daily_fat_goal: Number(resultFat) || 0,
      });
      router.replace("/dashboard");
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
          <StepIndicator step={step} total={4} colors={colors} />
          <Text style={styles.stepLabel}>
            {step === 5 ? "Results" : `Step ${step} of 4`}
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
              goalKg={goalKg}
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
              setComposition={setComposition}
            />
          )}
          {step === 5 && (
            <Result
              colors={colors}
              styles={styles}
              computed={computed}
              resultCal={resultCal}
              setResultCal={setResultCal}
              resultProt={resultProt}
              setResultProt={setResultProt}
              resultCarbs={resultCarbs}
              setResultCarbs={setResultCarbs}
              resultFat={resultFat}
              setResultFat={setResultFat}
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
          {step === 5 ? (
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
    <View style={{ flexDirection: "row", gap: 6, flex: 1 }}>
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const active = step === 5 ? true : n <= step;
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
            <Ionicons
              name="swap-horizontal"
              size={12}
              color={colors.textMuted}
            />
          </Pressable>
        </View>
        {props.heightUnit === "cm" ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.numInput}
              value={props.heightCmStr}
              onChangeText={(v) =>
                props.setHeightCmStr(v.replace(/[^0-9.]/g, ""))
              }
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
              onChangeText={(v) =>
                props.setHeightFtStr(v.replace(/[^0-9]/g, ""))
              }
              keyboardType="number-pad"
              maxLength={1}
              selectionColor={colors.accent}
            />
            <Text style={styles.inputUnit}>ft</Text>
            <TextInput
              style={[styles.numInput, { flex: 0, width: 60, marginLeft: 12 }]}
              value={props.heightInStr}
              onChangeText={(v) =>
                props.setHeightInStr(v.replace(/[^0-9]/g, ""))
              }
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
            <Ionicons
              name="swap-horizontal"
              size={12}
              color={colors.textMuted}
            />
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
          <View
            style={[
              styles.bmiChip,
              { backgroundColor: BMI_COLOR[bmiCat] },
            ]}
          >
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
  goalKg: number;
  goalWeightStr: string;
  setGoalWeightStr: (s: string) => void;
  timeframeStr: string;
  setTimeframeStr: (s: string) => void;
  weeklyKg: number;
}) {
  const { colors, styles, weeklyKg, weightKg, goalKg } = props;
  const losingTooFast = weeklyKg > 1;
  const healthy = healthyTimelineRangeWeeks(weightKg, goalKg);
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
            onChangeText={(v) =>
              props.setTimeframeStr(v.replace(/[^0-9]/g, ""))
            }
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
          {weeklyKg > 0
            ? "Weekly loss rate"
            : weeklyKg < 0
              ? "Weekly gain rate"
              : "Maintenance"}
        </Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>
          {weeklyKg === 0 ? "—" : weeklyDisplay}
        </Text>
      </View>

      {losingTooFast ? (
        <View
          style={[
            styles.warnCard,
            {
              backgroundColor: colors.surface,
              borderColor: "#F59E0B",
            },
          ]}
        >
          <Ionicons name="warning" size={18} color="#F59E0B" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.warnTitle, { color: colors.text }]}>
              That&apos;s a fast pace
            </Text>
            <Text style={[styles.warnBody, { color: colors.textMuted }]}>
              Losing more than 1kg/week is not recommended.
              {healthy
                ? ` A healthy timeline for your goal would be ${healthy.minWeeks}-${healthy.maxWeeks} weeks.`
                : ""}{" "}
              You can adjust the timeframe above, or continue anyway.
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
        {ACTIVITY_OPTIONS.map((opt) => {
          const active = props.activity === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => props.setActivity(opt.value)}
              style={({ pressed }) => [
                styles.optionCard,
                {
                  borderColor: active ? colors.accent : colors.surfaceBorder,
                  backgroundColor: active
                    ? colors.accent + "14"
                    : colors.surface,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.optionTitle,
                    { color: colors.text },
                  ]}
                >
                  {opt.title}
                </Text>
                <Text
                  style={[
                    styles.optionDesc,
                    { color: colors.textMuted },
                  ]}
                >
                  {opt.description}
                </Text>
              </View>
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={active ? colors.accent : colors.textSubtle}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Step4(props: {
  colors: Palette;
  styles: Styles;
  composition: CompositionGoal | null;
  setComposition: (c: CompositionGoal) => void;
}) {
  const { colors, styles } = props;
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text style={styles.title}>What&apos;s your goal?</Text>
        <Text style={styles.subtitle}>Pick the outcome you&apos;re after.</Text>
      </View>

      <View style={{ gap: 10 }}>
        {COMPOSITION_OPTIONS.map((opt) => {
          const active = props.composition === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => props.setComposition(opt.value)}
              style={({ pressed }) => [
                styles.optionCard,
                {
                  borderColor: active ? colors.accent : colors.surfaceBorder,
                  backgroundColor: active
                    ? colors.accent + "14"
                    : colors.surface,
                },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>
                  {opt.title}
                </Text>
                <Text style={[styles.optionDesc, { color: colors.textMuted }]}>
                  {opt.description}
                </Text>
              </View>
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={active ? colors.accent : colors.textSubtle}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Result(props: {
  colors: Palette;
  styles: Styles;
  computed: ReturnType<typeof computeMacros> | null;
  resultCal: string;
  setResultCal: (s: string) => void;
  resultProt: string;
  setResultProt: (s: string) => void;
  resultCarbs: string;
  setResultCarbs: (s: string) => void;
  resultFat: string;
  setResultFat: (s: string) => void;
  name: string;
}) {
  const { colors, styles, computed, name } = props;
  const rows = [
    { label: "Daily Calories", unit: "kcal", value: props.resultCal, set: props.setResultCal },
    { label: "Protein", unit: "g", value: props.resultProt, set: props.setResultProt },
    { label: "Carbs", unit: "g", value: props.resultCarbs, set: props.setResultCarbs },
    { label: "Fat", unit: "g", value: props.resultFat, set: props.setResultFat },
  ];
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
            {
              backgroundColor: colors.surface,
              borderColor: colors.surfaceBorder,
            },
          ]}
        >
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              BMR
            </Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {computed.bmr}
            </Text>
            <Text style={[styles.summaryUnit, { color: colors.textSubtle }]}>
              kcal
            </Text>
          </View>
          <View
            style={[
              styles.summaryDivider,
              { backgroundColor: colors.surfaceBorder },
            ]}
          />
          <View style={styles.summaryCell}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              TDEE
            </Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>
              {computed.tdee}
            </Text>
            <Text style={[styles.summaryUnit, { color: colors.textSubtle }]}>
              kcal
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        {rows.map((r) => (
          <View key={r.label} style={styles.field}>
            <Text style={styles.label}>{r.label}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.numInput}
                value={r.value}
                onChangeText={(v) => r.set(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                maxLength={5}
                selectionColor={colors.accent}
              />
              <Text style={styles.inputUnit}>{r.unit}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
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
    title: {
      color: c.text,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
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
    textInput: {
      color: c.text,
      fontSize: 18,
      fontWeight: "600",
      padding: 0,
    },
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
    bmiChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
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
