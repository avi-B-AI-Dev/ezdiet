import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import type { Palette } from "@/lib/theme";

type Props = {
  consumed: number;
  goal: number;
  colors: Palette;
  size?: number;
};

export default function CalorieRing({
  consumed,
  goal,
  colors,
  size = 160,
}: Props) {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const offset = circumference * (1 - progress);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceBorder}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.accent}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.consumed, { color: colors.text }]}>
        {Math.round(consumed)}
      </Text>
      <Text style={[styles.goal, { color: colors.textMuted }]}>
        of {Math.round(goal)} kcal
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  consumed: { fontSize: 30, fontWeight: "800" },
  goal: { fontSize: 12, marginTop: 2 },
});
