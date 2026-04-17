import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { WaterUnit } from "@/lib/db";
import type { Palette } from "@/lib/theme";

type Props = {
  unit: WaterUnit;
  goal: number;
  current: number;
  colors: Palette;
  onQuickAdd: () => void;
  onCustomAdd: () => void;
  onCycleUnit: () => void;
};

export default function WaterCard({
  unit,
  goal,
  current,
  colors,
  onQuickAdd,
  onCustomAdd,
  onCycleUnit,
}: Props) {
  const pct = goal > 0 ? Math.min(current / goal, 1) : 0;
  const display = (n: number) =>
    unit === "liters" ? n.toFixed(1) : (Math.round(n * 10) / 10).toString();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="water" size={18} color={colors.accent} />
          <Text style={[styles.title, { color: colors.text }]}>Water</Text>
        </View>
        <Pressable
          onPress={onCycleUnit}
          hitSlop={10}
          style={({ pressed }) => [
            styles.unitChip,
            { borderColor: colors.surfaceBorder },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.unitText, { color: colors.textMuted }]}>
            {unit}
          </Text>
          <Ionicons
            name="swap-horizontal"
            size={12}
            color={colors.textMuted}
          />
        </Pressable>
      </View>

      <View style={styles.amountRow}>
        <Text style={[styles.current, { color: colors.text }]}>
          {display(current)}
        </Text>
        <Text style={[styles.goal, { color: colors.textMuted }]}>
          / {display(goal)} {unit}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceBorder }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: colors.accent, width: `${pct * 100}%` },
          ]}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onQuickAdd}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="add" size={16} color={colors.accentText} />
          <Text style={[styles.addBtnText, { color: colors.accentText }]}>
            Add 1 {unit === "liters" ? "L" : unit === "oz" ? "oz" : "glass"}
          </Text>
        </Pressable>
        <Pressable
          onPress={onCustomAdd}
          style={({ pressed }) => [
            styles.customBtn,
            { borderColor: colors.surfaceBorder },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.customBtnText, { color: colors.textMuted }]}>
            Custom
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: "700" },
  unitChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  unitText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  current: { fontSize: 32, fontWeight: "800" },
  goal: { fontSize: 14 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
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
  customBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  customBtnText: { fontSize: 13, fontWeight: "600" },
});
