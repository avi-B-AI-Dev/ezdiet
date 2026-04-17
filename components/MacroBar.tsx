import { StyleSheet, Text, View } from "react-native";

import type { Palette } from "@/lib/theme";

type Props = {
  label: string;
  consumed: number;
  goal: number;
  color: string;
  colors: Palette;
};

export default function MacroBar({
  label,
  consumed,
  goal,
  color,
  colors,
}: Props) {
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.textMuted }]}>
          {Math.round(consumed)} / {Math.round(goal)}g
        </Text>
      </View>
      <View
        style={[styles.track, { backgroundColor: colors.surfaceBorder }]}
      >
        <View
          style={[
            styles.fill,
            { backgroundColor: color, width: `${pct * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontWeight: "600", fontSize: 13 },
  value: { fontSize: 12 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
});
