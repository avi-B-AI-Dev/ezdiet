import { StyleSheet, Text, View } from "react-native";

const PALETTE = [
  { bg: "#DBEAFE", fg: "#1E40AF" }, // blue
  { bg: "#DCFCE7", fg: "#166534" }, // green
  { bg: "#FEF3C7", fg: "#92400E" }, // amber
  { bg: "#FCE7F3", fg: "#9D174D" }, // pink
  { bg: "#E0E7FF", fg: "#3730A3" }, // indigo
  { bg: "#FEE2E2", fg: "#991B1B" }, // red
  { bg: "#CFFAFE", fg: "#155E75" }, // cyan
  { bg: "#F3E8FF", fg: "#6B21A8" }, // purple
];

function colorFor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export default function InitialsAvatar({
  name,
  size = 64,
}: {
  name: string;
  size?: number;
}) {
  const trimmed = (name || "?").trim();
  const initial = (trimmed.charAt(0) || "?").toUpperCase();
  const { bg, fg } = colorFor(trimmed.toLowerCase());
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: bg,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text style={[styles.letter, { color: fg, fontSize: size * 0.45 }]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  letter: { fontWeight: "800" },
});
