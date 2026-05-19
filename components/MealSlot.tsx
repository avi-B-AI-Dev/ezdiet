import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Meal } from "@/lib/db";
import type { Palette } from "@/lib/theme";

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  meals: Meal[];
  colors: Palette;
  onAdd: () => void;
  onQuickAdd: () => void;
  onPressMeal?: (meal: Meal) => void;
  onLongPressMeal?: (meal: Meal) => void;
};

export default function MealSlot({
  title,
  icon,
  meals,
  colors,
  onAdd,
  onQuickAdd,
  onPressMeal,
  onLongPressMeal,
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
      </View>

      {meals.length > 0 ? (
        <View style={styles.mealList}>
          {meals.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => onPressMeal?.(m)}
              onLongPress={() => onLongPressMeal?.(m)}
              delayLongPress={350}
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
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  title: { fontSize: 17, fontWeight: "800" },
  totalCals: { fontSize: 15, fontWeight: "600" },
  mealList: { gap: 10 },
  mealRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  mealName: { fontSize: 16, fontWeight: "600", flex: 1 },
  mealCals: { fontSize: 15, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: { fontSize: 14, fontWeight: "800" },
  quickBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  quickBtnText: { fontSize: 14, fontWeight: "700" },
});
