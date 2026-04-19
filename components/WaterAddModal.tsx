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

import type { WaterUnit } from "@/lib/db";
import type { Palette } from "@/lib/theme";
import { WATER_UNITS, toMl } from "@/lib/water-units";

type Props = {
  visible: boolean;
  initialUnit: WaterUnit;
  colors: Palette;
  onCancel: () => void;
  onConfirm: (ml: number) => void;
};

export default function WaterAddModal({
  visible,
  initialUnit,
  colors,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<WaterUnit>(initialUnit);

  useEffect(() => {
    if (visible) {
      setValue("");
      setUnit(initialUnit);
    }
  }, [visible, initialUnit]);

  const handleConfirm = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    onConfirm(toMl(n, unit));
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
              {
                backgroundColor: colors.background,
                borderColor: colors.surfaceBorder,
              },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              Add water
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.surfaceBorder,
                  },
                ]}
                value={value}
                onChangeText={(v) => setValue(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor={colors.placeholder}
                autoFocus
                selectionColor={colors.accent}
                maxLength={7}
              />
              <Text style={[styles.unitLabel, { color: colors.textMuted }]}>
                {unit}
              </Text>
            </View>
            <View style={styles.unitRow}>
              {WATER_UNITS.map((u) => {
                const active = u === unit;
                return (
                  <Pressable
                    key={u}
                    onPress={() => setUnit(u)}
                    style={({ pressed }) => [
                      styles.unitChip,
                      {
                        borderColor: active
                          ? colors.accent
                          : colors.surfaceBorder,
                        backgroundColor: active
                          ? colors.accent
                          : "transparent",
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
            <View style={styles.actions}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: colors.surfaceBorder },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: colors.accent, borderColor: "transparent" },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  style={[styles.btnText, { color: colors.accentText }]}
                >
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  card: { borderRadius: 16, padding: 20, borderWidth: 1, gap: 14 },
  title: { fontSize: 17, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  unitLabel: { fontSize: 14, fontWeight: "600", textTransform: "capitalize" },
  unitRow: { flexDirection: "row", gap: 8 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  btnText: { fontWeight: "700", fontSize: 14 },
});
