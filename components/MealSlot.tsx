import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Meal } from "@/lib/db";
import type { Palette } from "@/lib/theme";

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  meals: Meal[];
  favorited: boolean;
  colors: Palette;
  onAdd: () => void;
  onQuickAdd: () => void;
  onToggleFavorite: () => void;
  onPressMeal?: (meal: Meal) => void;
};

export default function MealSlot({
  title,
  icon,
  meals,
  favorited,
  colors,
  onAdd,
  onQuickAdd,
  onToggleFavorite,
  onPressMeal,
}: Props) {
  const totalCals = meals.reduce(
    (sum, m) => sum + m.total_calories * m.servings,
    0,
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={icon} size={18} color={colors.textMuted} />
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {meals.length > 0 ? (
            <Text style={[styles.totalCals, { color: colors.textMuted }]}>
              · {Math.round(totalCals)} kcal
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Ionicons
            name={favorited ? "star" : "star-outline"}
            size={20}
            color={favorited ? colors.accent : colors.textSubtle}
          />
        </Pressable>
      </View>

      {meals.length > 0 ? (
        <View style={styles.mealList}>
          {meals.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onPressMeal?.(m)}
              style={({ pressed }) => [
                styles.mealRow,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.mealName, { color: colors.text }]}
              >
                {m.description}
              </Text>
              <Text style={[styles.mealCals, { color: colors.textMuted }]}>
                {Math.round(m.total_calories * m.servings)} kcal
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="add" size={16} color={colors.accentText} />
          <Text style={[styles.addBtnText, { color: colors.accentText }]}>
            Add
          </Text>
        </Pressable>
        <Pressable
          onPress={onQuickAdd}
          style={({ pressed }) => [
            styles.quickBtn,
            { borderColor: colors.surfaceBorder },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.quickBtnText, { color: colors.textMuted }]}>
            Quick add
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  title: { fontSize: 15, fontWeight: "700" },
  totalCals: { fontSize: 13 },
  mealList: { gap: 8 },
  mealRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  mealName: { fontSize: 14, flex: 1 },
  mealCals: { fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { fontSize: 13, fontWeight: "700" },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  quickBtnText: { fontSize: 13, fontWeight: "600" },
});
