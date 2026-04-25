import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { MealSource } from "@/lib/db";
import type { Palette } from "@/lib/theme";

export type QuickAddPayload = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  name: string | null;
  source: MealSource;
  restaurantName: string | null;
};

type Props = {
  visible: boolean;
  title: string;
  colors: Palette;
  onCancel: () => void;
  onConfirm: (value: QuickAddPayload) => void;
};

export default function QuickAddModal({
  visible,
  title,
  colors,
  onCancel,
  onConfirm,
}: Props) {
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState<MealSource>("homemade");
  const [restaurant, setRestaurant] = useState("");

  useEffect(() => {
    if (visible) {
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setName("");
      setSource("homemade");
      setRestaurant("");
    }
  }, [visible]);

  const handleConfirm = () => {
    const cal = Number(calories);
    if (!Number.isFinite(cal) || cal <= 0) return;
    onConfirm({
      calories: cal,
      protein: parseOptional(protein),
      carbs: parseOptional(carbs),
      fat: parseOptional(fat),
      name: name.trim() || null,
      source,
      restaurantName: source === "restaurant" ? restaurant.trim() || null : null,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.center}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.card,
              { backgroundColor: colors.background, borderColor: colors.surfaceBorder },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

            {/* Name */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Name (optional)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: colors.text, borderColor: colors.surfaceBorder },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="Office pizza, party snacks..."
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.accent}
              />
            </View>

            {/* Source toggle */}
            <View style={styles.sourceRow}>
              <Pressable
                onPress={() => setSource("homemade")}
                style={({ pressed }) => [
                  styles.sourceBtn,
                  {
                    backgroundColor:
                      source === "homemade" ? colors.accent : colors.surface,
                    borderColor:
                      source === "homemade" ? colors.accent : colors.surfaceBorder,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={{
                    color: source === "homemade" ? colors.accentText : colors.text,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  🏠 Homemade
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSource("restaurant")}
                style={({ pressed }) => [
                  styles.sourceBtn,
                  {
                    backgroundColor:
                      source === "restaurant" ? colors.accent : colors.surface,
                    borderColor:
                      source === "restaurant" ? colors.accent : colors.surfaceBorder,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={{
                    color:
                      source === "restaurant" ? colors.accentText : colors.text,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  🍽️ Restaurant
                </Text>
              </Pressable>
            </View>

            {source === "restaurant" && (
              <View>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                  Restaurant name
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { color: colors.text, borderColor: colors.surfaceBorder },
                  ]}
                  value={restaurant}
                  onChangeText={setRestaurant}
                  placeholder="Chipotle, Olive Garden..."
                  placeholderTextColor={colors.placeholder}
                  selectionColor={colors.accent}
                />
              </View>
            )}

            {/* Calories — required */}
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                Calories <Text style={{ color: "#EF4444" }}>*</Text>
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.numInput,
                    { color: colors.text, borderColor: colors.surfaceBorder },
                  ]}
                  value={calories}
                  onChangeText={(v) => setCalories(v.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder="450"
                  placeholderTextColor={colors.placeholder}
                  autoFocus
                  selectionColor={colors.accent}
                  maxLength={7}
                />
                <Text style={[styles.unit, { color: colors.textMuted }]}>kcal</Text>
              </View>
            </View>

            {/* Optional macros */}
            <View style={styles.macrosGrid}>
              <MacroField label="Protein (g)" value={protein} onChange={setProtein} colors={colors} />
              <MacroField label="Carbs (g)" value={carbs} onChange={setCarbs} colors={colors} />
              <MacroField label="Fat (g)" value={fat} onChange={setFat} colors={colors} />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: colors.surfaceBorder },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnPrimary,
                  { backgroundColor: colors.accent },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="checkmark" size={16} color={colors.accentText} />
                <Text style={[styles.btnText, { color: colors.accentText }]}>
                  Add
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function MacroField({
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
    <View style={{ flex: 1 }}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          styles.numInput,
          { color: colors.text, borderColor: colors.surfaceBorder },
        ]}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9.]/g, ""))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.accent}
        maxLength={5}
      />
    </View>
  );
}

function parseOptional(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 14,
  },
  title: { fontSize: 18, fontWeight: "800" },
  fieldLabel: { fontSize: 12, fontWeight: "700", marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  numInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  unit: { fontSize: 14, fontWeight: "600" },
  sourceRow: { flexDirection: "row", gap: 8 },
  sourceBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  macrosGrid: { flexDirection: "row", gap: 8 },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 4 },
  btn: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  btnPrimary: { borderColor: "transparent" },
  btnText: { fontWeight: "700", fontSize: 14 },
});
