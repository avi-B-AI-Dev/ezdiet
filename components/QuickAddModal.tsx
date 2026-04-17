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

import type { Palette } from "@/lib/theme";

type Props = {
  visible: boolean;
  title: string;
  placeholder?: string;
  unit?: string;
  initialValue?: string;
  colors: Palette;
  onCancel: () => void;
  onConfirm: (value: number) => void;
};

export default function QuickAddModal({
  visible,
  title,
  placeholder,
  unit,
  initialValue = "",
  colors,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const handleConfirm = () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    onConfirm(n);
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
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.surfaceBorder }]}
                value={value}
                onChangeText={(v) => setValue(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder={placeholder}
                placeholderTextColor={colors.placeholder}
                autoFocus
                selectionColor={colors.accent}
                maxLength={7}
              />
              {unit ? (
                <Text style={[styles.unit, { color: colors.textMuted }]}>
                  {unit}
                </Text>
              ) : null}
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
                  styles.btnPrimary,
                  { backgroundColor: colors.accent },
                  pressed && { opacity: 0.85 },
                ]}
              >
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 16,
  },
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
  unit: { fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  btnPrimary: { borderColor: "transparent" },
  btnText: { fontWeight: "700", fontSize: 14 },
});
