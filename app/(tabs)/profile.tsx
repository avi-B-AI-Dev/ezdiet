import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
  getUser,
  resetDatabase,
  saveOnboardingProfile,
  updateWaterSettings,
  type WaterUnit,
} from "@/lib/db";
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
import { WATER_UNITS } from "@/lib/water-units";

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
    setWaterGoalStr(String(u.water_goal));
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!loaded) load();
    }, [load, loaded]),
  );

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

  const canRecalc =
    !!gender && !!activity && !!composition && weightKg > 0 && heightCm > 0 && age > 0;

  const handleRecalc = () => {
    if (!canRecalc || !gender || !activity || !composition) return;
    const r = computeMacros({
      weightKg,
      heightCm,
      age,
      gender,
      activity,
      composition,
      weeklyKg,
    });
    setCalStr(String(r.calories));
    setProtStr(String(r.protein));
    setCarbsStr(String(r.carbs));
    setFatStr(String(r.fat));
  };

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
      });
      await updateWaterSettings(waterUnit, Number(waterGoalStr) || 0);
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

  const losingTooFast = weeklyKg > 1;
  const healthy = healthyTimelineRangeWeeks(weightKg, goalKg);
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
            {losingTooFast ? (
              <View style={styles.warnCard}>
                <Ionicons name="warning" size={18} color="#F59E0B" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.warnTitle}>That&apos;s a fast pace</Text>
                  <Text style={styles.warnBody}>
                    Losing more than 1kg/week is not recommended.
                    {healthy
                      ? ` A healthy timeline would be ${healthy.minWeeks}-${healthy.maxWeeks} weeks.`
                      : ""}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <Text style={styles.subLabel}>Composition goal</Text>
              {COMPOSITION_OPTIONS.map((opt) => (
                <OptionRadio
                  key={opt.value}
                  colors={colors}
                  styles={styles}
                  title={opt.title}
                  description={opt.description}
                  active={composition === opt.value}
                  onPress={() => setComposition(opt.value)}
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

          {/* Daily targets */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Daily targets</Text>
              <Pressable
                onPress={handleRecalc}
                disabled={!canRecalc}
                style={({ pressed }) => [
                  styles.recalcBtn,
                  { borderColor: colors.accent },
                  !canRecalc && { opacity: 0.4 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="refresh" size={14} color={colors.accent} />
                <Text style={[styles.recalcBtnText, { color: colors.accent }]}>
                  Recalculate
                </Text>
              </Pressable>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Daily Calories</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.numInput}
                  value={calStr}
                  onChangeText={(v) => setCalStr(v.replace(/[^0-9]/g, ""))}
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
                  onChangeText={(v) => setProtStr(v.replace(/[^0-9]/g, ""))}
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
                  onChangeText={(v) => setCarbsStr(v.replace(/[^0-9]/g, ""))}
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
                  onChangeText={(v) => setFatStr(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={4}
                  selectionColor={colors.accent}
                />
                <Text style={styles.inputUnit}>g</Text>
              </View>
            </View>
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
                      onPress={() => setWaterUnit(u)}
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

    footer: { padding: 20, paddingTop: 8 },
    button: {
      backgroundColor: c.accent,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
    },
    buttonText: { color: c.accentText, fontSize: 16, fontWeight: "700" },
  });
