import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Palette, useTheme } from "@/lib/theme";

export default function PantryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.inner}>
        <Ionicons name="list" size={56} color={colors.accent} />
        <Text style={styles.title}>Pantry</Text>
        <Text style={styles.subtitle}>
          Your saved foods, scanned items, and favorites will live here.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
      gap: 10,
    },
    title: { color: c.text, fontSize: 22, fontWeight: "700", marginTop: 8 },
    subtitle: {
      color: c.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
  });
