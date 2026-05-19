import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import InitialsAvatar from "@/components/InitialsAvatar";
import { getCookingRatio } from "@/lib/cookingState";
import {
  deletePantryItem,
  estimateRemainingDisplay,
  formatServingDisplay,
  getPantryItem,
  updatePantryItem,
  type PantryCategory,
  type PantryItem,
  type PantryItemInput,
  type PantrySource,
} from "@/lib/db";
import { Palette, useTheme } from "@/lib/theme";

const CATEGORIES: PantryCategory[] = [
  "grain",
  "protein",
  "vegetable",
  "fruit",
  "dairy",
  "oil",
  "spice",
  "packaged",
  "other",
];

export default function PantryItemScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const itemId = id ? Number(id) : null;

  const [item, setItem] = useState<PantryItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);

  useEffect(() => {
    if (!itemId) return;
    getPantryItem(itemId).then((i) => {
      setItem(i);
      if (i) setDraft(toDraft(i));
    });
  }, [itemId]);

  if (!item || !draft) {
    return <SafeAreaView style={styles.container} edges={["top"]} />;
  }

  const remaining = estimateRemainingDisplay(item);

  const handleSave = async () => {
    if (!itemId) return;
    const input = fromDraft(draft, item);
    if (!input.name.trim()) {
      Alert.alert("Name required", "Please enter a name for this item.");
      return;
    }
    await updatePantryItem(itemId, input);
    const fresh = await getPantryItem(itemId);
    if (fresh) {
      setItem(fresh);
      setDraft(toDraft(fresh));
    }
    setEditing(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete this item?", item.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!itemId) return;
          await deletePantryItem(itemId);
          router.back();
        },
      },
    ]);
  };

  const perServingFactor = item.serving_size > 0 ? item.serving_size / 100 : 1;
  const perServing = {
    cal: Math.round(item.calories_per_100g * perServingFactor),
    protein: Math.round(item.protein_per_100g * perServingFactor),
    carbs: Math.round(item.carbs_per_100g * perServingFactor),
    fat: Math.round(item.fat_per_100g * perServingFactor),
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {editing ? "Edit item" : "Pantry item"}
        </Text>
        {editing ? (
          <Pressable onPress={handleSave} hitSlop={10}>
            <Text style={[styles.headerAction, { color: colors.accent }]}>
              Save
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setEditing(true)} hitSlop={10}>
            <Ionicons name="create-outline" size={22} color={colors.accent} />
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Initials avatar + name */}
        <View style={styles.heroRow}>
          <InitialsAvatar name={item.name} size={96} />
          <View style={{ flex: 1, gap: 4 }}>
            {editing ? (
              <TextInput
                style={[
                  styles.nameInput,
                  { color: colors.text, borderColor: colors.surfaceBorder },
                ]}
                value={draft.name}
                onChangeText={(v) => setDraft({ ...draft, name: v })}
              />
            ) : (
              <Text style={[styles.heroName, { color: colors.text }]}>
                {item.name}
              </Text>
            )}
            {editing ? (
              <TextInput
                style={[
                  styles.brandInput,
                  { color: colors.text, borderColor: colors.surfaceBorder },
                ]}
                value={draft.brand}
                onChangeText={(v) => setDraft({ ...draft, brand: v })}
                placeholder="Brand (optional)"
                placeholderTextColor={colors.placeholder}
              />
            ) : item.brand ? (
              <Text style={[styles.heroBrand, { color: colors.textMuted }]}>
                {item.brand}
              </Text>
            ) : null}
            <SourceBadge source={item.source} confidence={item.confidence_score} />
          </View>
        </View>

        {/* Per serving / per 100g blocks */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Per serving — {formatServingDisplay(item)}
          </Text>
          <View
            style={[
              styles.nutritionBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <NutriCell label="Calories" value={`${perServing.cal}`} unit="kcal" colors={colors} />
            <NutriCell label="Protein" value={`${perServing.protein}`} unit="g" colors={colors} />
            <NutriCell label="Carbs" value={`${perServing.carbs}`} unit="g" colors={colors} />
            <NutriCell label="Fat" value={`${perServing.fat}`} unit="g" colors={colors} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Per 100g
          </Text>
          <View
            style={[
              styles.nutritionBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            {editing ? (
              <>
                <EditNutri label="Cal" value={draft.cal100} onChange={(v) => setDraft({ ...draft, cal100: v })} colors={colors} />
                <EditNutri label="P" value={draft.pro100} onChange={(v) => setDraft({ ...draft, pro100: v })} colors={colors} />
                <EditNutri label="C" value={draft.carb100} onChange={(v) => setDraft({ ...draft, carb100: v })} colors={colors} />
                <EditNutri label="F" value={draft.fat100} onChange={(v) => setDraft({ ...draft, fat100: v })} colors={colors} />
              </>
            ) : (
              <>
                <NutriCell label="Calories" value={`${Math.round(item.calories_per_100g)}`} unit="kcal" colors={colors} />
                <NutriCell label="Protein" value={`${Math.round(item.protein_per_100g)}`} unit="g" colors={colors} />
                <NutriCell label="Carbs" value={`${Math.round(item.carbs_per_100g)}`} unit="g" colors={colors} />
                <NutriCell label="Fat" value={`${Math.round(item.fat_per_100g)}`} unit="g" colors={colors} />
              </>
            )}
          </View>
        </View>

        {/* Serving + package details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Details
          </Text>
          <View
            style={[
              styles.detailsBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <DetailRow
              label="Serving size"
              value={formatServingDisplay(item)}
              editing={editing}
              colors={colors}
              draftSize={draft.servingSize}
              draftUnit={draft.servingUnit}
              onChangeSize={(v) => setDraft({ ...draft, servingSize: v })}
              onChangeUnit={(v) => setDraft({ ...draft, servingUnit: v })}
            />
            <DetailRow
              label="Package size"
              value={
                item.total_package_size != null
                  ? `${item.total_package_size}${item.total_package_unit ?? ""}`
                  : "—"
              }
              editing={editing}
              colors={colors}
              draftSize={draft.packageSize}
              draftUnit={draft.packageUnit}
              onChangeSize={(v) => setDraft({ ...draft, packageSize: v })}
              onChangeUnit={(v) => setDraft({ ...draft, packageUnit: v })}
            />
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                Servings per package
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {formatServingsPerPackage(item)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                Estimated remaining
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {remaining?.text ?? "—"}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                Date added
              </Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {formatDate(item.created_at)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                Category
              </Text>
              {editing ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {CATEGORIES.map((c) => {
                      const active = c === draft.category;
                      return (
                        <Pressable
                          key={c}
                          onPress={() => setDraft({ ...draft, category: c })}
                          style={({ pressed }) => [
                            styles.catChip,
                            {
                              backgroundColor: active
                                ? colors.accent
                                : "transparent",
                              borderColor: active
                                ? colors.accent
                                : colors.surfaceBorder,
                            },
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: active ? colors.accentText : colors.text,
                            }}
                          >
                            {c}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  {item.category ?? "—"}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Delete */}
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="trash" size={18} color="#FFF" />
          <Text style={styles.deleteBtnText}>Delete from pantry</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────

function NutriCell({
  label,
  value,
  unit,
  colors,
}: {
  label: string;
  value: string;
  unit: string;
  colors: Palette;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text, marginTop: 4 }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: colors.textSubtle, fontWeight: "600" }}>
        {unit}
      </Text>
    </View>
  );
}

function EditNutri({
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
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: colors.surfaceBorder,
          borderRadius: 8,
          width: 70,
          height: 38,
          paddingHorizontal: 6,
          fontSize: 16,
          fontWeight: "700",
          color: colors.text,
          textAlign: "center",
          marginTop: 4,
        }}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

function DetailRow({
  label,
  value,
  editing,
  colors,
  draftSize,
  draftUnit,
  onChangeSize,
  onChangeUnit,
}: {
  label: string;
  value: string;
  editing: boolean;
  colors: Palette;
  draftSize: string;
  draftUnit: string;
  onChangeSize: (v: string) => void;
  onChangeUnit: (v: string) => void;
}) {
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.label, { color: colors.textMuted }]}>
        {label}
      </Text>
      {editing ? (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <TextInput
            style={[
              detailStyles.smallInput,
              { color: colors.text, borderColor: colors.surfaceBorder, width: 70 },
            ]}
            value={draftSize}
            onChangeText={(v) => onChangeSize(v.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[
              detailStyles.smallInput,
              { color: colors.text, borderColor: colors.surfaceBorder, width: 60 },
            ]}
            value={draftUnit}
            onChangeText={onChangeUnit}
            placeholder="g"
            placeholderTextColor={colors.placeholder}
          />
        </View>
      ) : (
        <Text style={[detailStyles.value, { color: colors.text }]}>{value}</Text>
      )}
    </View>
  );
}

function SourceBadge({
  source,
  confidence,
}: {
  source: PantrySource;
  confidence: number | null;
}) {
  let label: string;
  let bg: string;
  let fg: string;
  if (source === "label_verified" || source === "scanned") {
    label = "Label";
    bg = "#DCFCE7";
    fg = "#166534";
  } else if (source === "api_lookup") {
    label = "API";
    bg = "#DBEAFE";
    fg = "#1E40AF";
  } else if (source === "ai_estimated") {
    label = "AI estimate";
    bg = "#FEF3C7";
    fg = "#92400E";
  } else {
    label = "Common";
    bg = "#E0E7FF";
    fg = "#3730A3";
  }
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        marginTop: 4,
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: "800" }}>
        {label}
        {confidence != null ? ` · ${confidence}%` : ""}
      </Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// Draft state helpers
// ───────────────────────────────────────────────────────────────────

type DraftState = {
  name: string;
  brand: string;
  cal100: string;
  pro100: string;
  carb100: string;
  fat100: string;
  servingSize: string;
  servingUnit: string;
  packageSize: string;
  packageUnit: string;
  category: PantryCategory;
};

function toDraft(item: PantryItem): DraftState {
  return {
    name: item.name,
    brand: item.brand ?? "",
    cal100: String(Math.round(item.calories_per_100g)),
    pro100: String(Math.round(item.protein_per_100g)),
    carb100: String(Math.round(item.carbs_per_100g)),
    fat100: String(Math.round(item.fat_per_100g)),
    servingSize: String(item.serving_size),
    servingUnit: item.serving_unit,
    packageSize:
      item.total_package_size != null ? String(item.total_package_size) : "",
    packageUnit: item.total_package_unit ?? "",
    category: item.category ?? "other",
  };
}

function fromDraft(draft: DraftState, base: PantryItem): PantryItemInput {
  const num = (s: string, fallback = 0): number => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    name: draft.name.trim(),
    brand: draft.brand.trim() || null,
    barcode: base.barcode,
    calories_per_100g: num(draft.cal100),
    protein_per_100g: num(draft.pro100),
    carbs_per_100g: num(draft.carb100),
    fat_per_100g: num(draft.fat100),
    fiber_per_100g: base.fiber_per_100g,
    serving_size: num(draft.servingSize, 100),
    serving_unit: draft.servingUnit.trim() || "g",
    servings_per_package: base.servings_per_package,
    total_package_size: draft.packageSize ? num(draft.packageSize) : null,
    total_package_unit: draft.packageUnit.trim() || null,
    category: draft.category,
    micronutrients: base.micronutrients,
    photo_uri: base.photo_uri,
    source: base.source,
    confidence_score: base.confidence_score,
    quantity_purchased: base.quantity_purchased,
    quantity_remaining: base.quantity_remaining,
  };
}

// Compute how many servings the package yields. Pantry stores raw weight
// (the form purchased); for convertible items (rice, dal, pasta, ...) the
// serving is normally in cooked form, so we must apply the cooking ratio:
//
//   servings = (raw_weight × cooking_ratio) / cooked_serving_size
//
// We previously gated the ratio on a substring search for "cooked" in the
// serving_unit; that quietly skipped the conversion whenever the suffix was
// missing (legacy rows, edited rows, OFF/AI sources). The robust signal is
// "is this item convertible?" — we own that table. An explicit "raw"/"dry"
// in the unit is treated as the rare opt-out.
function formatServingsPerPackage(item: PantryItem): string {
  const pkgSize = item.total_package_size;
  const pkgUnit = (item.total_package_unit ?? "").toLowerCase();
  const servingSize = item.serving_size;
  const servingUnit = (item.serving_unit ?? "").toLowerCase();
  if (!pkgSize || pkgSize <= 0 || !servingSize || servingSize <= 0) return "—";

  const pkgGrams = unitToGrams(pkgSize, pkgUnit);
  if (pkgGrams == null) return "—";

  const ratio = getCookingRatio(item.name);
  const servingExplicitlyRaw = /\b(raw|dry|uncooked|dried)\b/.test(servingUnit);

  let count: number;
  if (ratio == null) {
    // Non-convertible (eggs, milk, oil, ...) — same form on both sides.
    count = pkgGrams / servingSize;
  } else if (servingExplicitlyRaw) {
    // Both package and serving are raw — no conversion needed.
    count = pkgGrams / servingSize;
  } else {
    // Convertible item, serving is cooked (or unspecified — default cooked).
    // raw package × ratio = cooked equivalent ÷ cooked-cup weight = servings.
    count = (pkgGrams * ratio) / servingSize;
  }
  if (!Number.isFinite(count) || count <= 0) return "—";
  const display = count >= 10
    ? String(Math.round(count))
    : count.toFixed(1).replace(/\.0$/, "");
  return `~${display}`;
}

function unitToGrams(size: number, unit: string): number | null {
  switch (unit) {
    case "g":
    case "ml":
      return size;
    case "kg":
    case "l":
      return size * 1000;
    case "oz":
      return size * 28.3495;
    case "lb":
    case "lbs":
      return size * 453.592;
    case "gallon":
    case "gallons":
      return size * 3785.41;
    case "":
    case "whole":
    case "piece":
    case "pieces":
    case "slice":
    case "slices":
    case "loaf":
    case "loaves":
    case "pack":
    case "bottle":
    case "jar":
    case "bag":
    case "cup":
    case "cups":
    case "dozen":
      // Count-based packages — caller usually doesn't compute servings here,
      // but if they do, treat 1 unit = 100g as a rough fallback.
      return size * 100;
    default:
      return null;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  label: { fontSize: 13, fontWeight: "700" },
  value: { fontSize: 14, fontWeight: "700" },
  smallInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: "600",
  },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: c.text, flex: 1, textAlign: "center" },
    headerAction: { fontSize: 16, fontWeight: "800" },

    scroll: { padding: 20, paddingBottom: 48, gap: 18 },

    heroRow: { flexDirection: "row", gap: 14 },
    heroPhoto: { width: 96, height: 96, borderRadius: 14 },
    heroPhotoPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    heroName: { fontSize: 22, fontWeight: "800" },
    heroBrand: { fontSize: 14, fontWeight: "600" },
    nameInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 18,
      fontWeight: "700",
    },
    brandInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      fontSize: 14,
      marginTop: 4,
    },

    section: { gap: 8 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },

    nutritionBox: {
      flexDirection: "row",
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },

    detailsBox: {
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
    },
    detailLabel: { fontSize: 13, fontWeight: "700" },
    detailValue: { fontSize: 14, fontWeight: "700" },
    catChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },

    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "#EF4444",
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 8,
    },
    deleteBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
  });
