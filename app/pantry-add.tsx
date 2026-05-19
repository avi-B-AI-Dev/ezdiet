import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import InitialsAvatar from "@/components/InitialsAvatar";
import type { PantryItem } from "@/lib/db";
import { Palette, useTheme } from "@/lib/theme";
import {
  detectItemsInGroupPhoto,
  identifySingleItem,
  parseQuantityFromName,
  readNutritionLabel,
  resolveHaulItem,
  resolvedFromLabel,
  saveResolvedItem,
  type ResolvedHaulItem,
  type SaveStrategy,
} from "@/lib/pantryHaul";

type Method = "group" | "single" | "type";

type CameraTarget =
  | { kind: "group" }
  | { kind: "single" }
  | { kind: "label" };

type GroupRow = {
  name: string;
  quantity: string;
  unit: string;
  checked: boolean;
};

const COMMON_UNITS = [
  "whole",
  "g",
  "kg",
  "lb",
  "oz",
  "ml",
  "l",
  "gallon",
  "piece",
  "pack",
  "bottle",
  "loaf",
  "jar",
  "bag",
  "cup",
];

export default function PantryAddScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [method, setMethod] = useState<Method>("group");
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);

  // Group flow state
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [extraName, setExtraName] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);

  // Single-item flow state
  const [singleName, setSingleName] = useState("");
  const [singleQty, setSingleQty] = useState("");
  const [singleUnit, setSingleUnit] = useState("whole");
  const [singleResolved, setSingleResolved] = useState<ResolvedHaulItem | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleSaving, setSingleSaving] = useState(false);

  // Type-it flow state
  const [typedName, setTypedName] = useState("");
  const [typedQty, setTypedQty] = useState("");
  const [typedUnit, setTypedUnit] = useState("whole");
  const [typedResolved, setTypedResolved] = useState<ResolvedHaulItem | null>(null);
  const [typedLoading, setTypedLoading] = useState(false);
  const [typedSaving, setTypedSaving] = useState(false);

  const cameraRef = useRef<CameraView | null>(null);

  // ─────────────────────────────────────────────────────────────────
  // Camera helpers
  // ─────────────────────────────────────────────────────────────────

  const openCameraFor = async (target: CameraTarget) => {
    if (!permission) return;
    if (!permission.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        Alert.alert(
          "Camera not available",
          "Allow camera access to scan groceries.",
        );
        return;
      }
    }
    setCameraTarget(target);
  };

  const handleCapture = async () => {
    const target = cameraTarget;
    if (!target) return;
    let photoUri: string | null = null;
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6 });
      photoUri = photo?.uri ?? null;
    } catch {
      photoUri = null;
    }
    setCameraTarget(null);

    if (target.kind === "group") {
      const items = await detectItemsInGroupPhoto(photoUri ?? "");
      // Mock mode → quantities empty for the user to fill in. Live mode
      // would arrive with quantities populated by the vision model.
      setGroupRows(
        items.map((i) => ({
          name: i.name,
          quantity: "",
          unit: "whole",
          checked: true,
        })),
      );
    } else if (target.kind === "single") {
      const ident = await identifySingleItem(photoUri ?? "");
      // In mock mode the identifier returns the placeholder so the user
      // can edit the name themselves and then look it up.
      setSingleName(ident?.name ?? "Unknown Packaged Item");
      setSingleQty("");
      setSingleUnit("whole");
      setSingleResolved(null);
    } else if (target.kind === "label") {
      if (!singleName.trim()) {
        Alert.alert("Name required", "Enter the product name first.");
        return;
      }
      const label = await readNutritionLabel(photoUri ?? "");
      const fromLabel = resolvedFromLabel(
        singleName,
        null,
        label,
        photoUri,
      );
      setSingleResolved(fromLabel);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Group flow actions
  // ─────────────────────────────────────────────────────────────────

  const updateGroupRow = (idx: number, patch: Partial<GroupRow>) => {
    setGroupRows((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  };

  const removeGroupRow = (idx: number) => {
    setGroupRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const addExtra = () => {
    const trimmed = extraName.trim();
    if (!trimmed) return;
    const parsed = parseQuantityFromName(trimmed);
    setGroupRows((prev) => [
      ...prev,
      {
        name: parsed.name,
        quantity: parsed.quantity != null ? String(parsed.quantity) : "",
        unit: parsed.unit ?? "whole",
        checked: true,
      },
    ]);
    setExtraName("");
  };

  const saveAllGroup = async () => {
    const checked = groupRows.filter((r) => r.checked);
    if (checked.length === 0) {
      Alert.alert("Nothing selected", "Tick at least one item to add.");
      return;
    }
    setGroupSaving(true);
    let added = 0;
    let duplicates = 0;
    for (const row of checked) {
      try {
        const resolved = await resolveHaulItem(row.name, null);
        const qty = parseFloat(row.quantity);
        const outcome = await saveResolvedItem(resolved, {
          quantityPurchased: Number.isFinite(qty) && qty > 0 ? qty : 1,
          totalPackageSize: Number.isFinite(qty) && qty > 0 ? qty : null,
          totalPackageUnit: row.unit,
        });
        if (outcome.kind === "saved") added += 1;
        else duplicates += 1;
      } catch {
        // Skip items that fail to resolve.
      }
    }
    setGroupSaving(false);
    setGroupRows([]);
    Alert.alert(
      "Pantry updated",
      `${added} added${
        duplicates > 0
          ? `, ${duplicates} already in pantry — open the item to edit.`
          : ""
      }.`,
      [{ text: "OK", onPress: () => router.back() }],
    );
  };

  // ─────────────────────────────────────────────────────────────────
  // Single-item flow
  // ─────────────────────────────────────────────────────────────────

  const lookupSingle = async () => {
    const name = singleName.trim();
    if (!name || name.toLowerCase() === "unknown packaged item") {
      Alert.alert("Enter a name", "Type the actual product name to look it up.");
      return;
    }
    setSingleLoading(true);
    try {
      const resolved = await resolveHaulItem(name, null);
      setSingleResolved(resolved);
    } finally {
      setSingleLoading(false);
    }
  };

  const saveSingle = async () => {
    let resolved = singleResolved;
    if (!resolved) {
      const name = singleName.trim();
      if (!name) {
        Alert.alert("Enter a name", "Type the actual product name first.");
        return;
      }
      resolved = await resolveHaulItem(name, null);
      setSingleResolved(resolved);
    }
    const qty = parseFloat(singleQty);
    setSingleSaving(true);
    await commitWithDedupe({
      resolved,
      quantityPurchased: Number.isFinite(qty) && qty > 0 ? qty : null,
      totalPackageSize: Number.isFinite(qty) && qty > 0 ? qty : null,
      totalPackageUnit: singleUnit,
      onDone: () => {
        setSingleSaving(false);
        setSingleName("");
        setSingleQty("");
        setSingleUnit("whole");
        setSingleResolved(null);
        router.back();
      },
      onCancel: () => setSingleSaving(false),
    });
  };

  // ─────────────────────────────────────────────────────────────────
  // Type-it flow
  // ─────────────────────────────────────────────────────────────────

  const lookupTyped = async () => {
    const raw = typedName.trim();
    if (!raw) {
      Alert.alert("Enter a name", "Type something like 'eggs' or 'amul ghee'.");
      return;
    }
    const parsed = parseQuantityFromName(raw);
    setTypedLoading(true);
    try {
      const resolved = await resolveHaulItem(parsed.name, null);
      setTypedResolved(resolved);
      // Pre-fill quantity field if we parsed one out of the typed string.
      if (parsed.quantity != null) {
        setTypedQty(String(parsed.quantity));
        setTypedUnit(parsed.unit ?? "whole");
        setTypedName(parsed.name);
      }
    } finally {
      setTypedLoading(false);
    }
  };

  const saveTyped = async () => {
    if (!typedResolved) return;
    const qty = parseFloat(typedQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert(
        "How many did you buy?",
        "Enter the quantity so we can track usage.",
      );
      return;
    }
    setTypedSaving(true);
    await commitWithDedupe({
      resolved: typedResolved,
      quantityPurchased: qty,
      totalPackageSize: qty,
      totalPackageUnit: typedUnit,
      onDone: () => {
        setTypedSaving(false);
        setTypedResolved(null);
        setTypedName("");
        setTypedQty("");
        setTypedUnit("whole");
        router.back();
      },
      onCancel: () => setTypedSaving(false),
    });
  };

  // ─────────────────────────────────────────────────────────────────
  // Three-option dedupe (Add to existing / Replace / Skip)
  // ─────────────────────────────────────────────────────────────────

  const commitWithDedupe = async (params: {
    resolved: ResolvedHaulItem;
    quantityPurchased: number | null;
    totalPackageSize: number | null;
    totalPackageUnit: string | null;
    onDone: () => void;
    onCancel: () => void;
  }) => {
    const outcome = await saveResolvedItem(params.resolved, {
      quantityPurchased: params.quantityPurchased,
      totalPackageSize: params.totalPackageSize,
      totalPackageUnit: params.totalPackageUnit,
    });
    if (outcome.kind === "saved") {
      params.onDone();
      return;
    }
    promptDuplicate({
      existing: outcome.existing,
      onChoose: async (strategy) => {
        if (strategy === "skip") {
          params.onCancel();
          return;
        }
        await saveResolvedItem(params.resolved, {
          quantityPurchased: params.quantityPurchased,
          totalPackageSize: params.totalPackageSize,
          totalPackageUnit: params.totalPackageUnit,
          strategy,
        });
        params.onDone();
      },
    });
  };

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Add to pantry</Text>
          <View style={{ width: 26 }} />
        </View>

        {/* Method tabs */}
        <View style={styles.tabRow}>
          <MethodTab
            label="Group photo"
            icon="grid-outline"
            active={method === "group"}
            onPress={() => setMethod("group")}
            colors={colors}
          />
          <MethodTab
            label="One item"
            icon="cube-outline"
            active={method === "single"}
            onPress={() => setMethod("single")}
            colors={colors}
          />
          <MethodTab
            label="Type"
            icon="create-outline"
            active={method === "type"}
            onPress={() => setMethod("type")}
            colors={colors}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {method === "group" && (
            <>
              <Pressable
                onPress={() => openCameraFor({ kind: "group" })}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.accent },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="camera" size={20} color={colors.accentText} />
                <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                  Scan all groceries
                </Text>
              </Pressable>

              {groupRows.length > 0 && (
                <View style={styles.checklist}>
                  <Text style={[styles.checklistTitle, { color: colors.text }]}>
                    I found these items. Enter quantities:
                  </Text>
                  {groupRows.map((row, i) => (
                    <View
                      key={`${row.name}-${i}`}
                      style={[styles.detectedRow, { borderColor: colors.surfaceBorder }]}
                    >
                      <Pressable
                        onPress={() => updateGroupRow(i, { checked: !row.checked })}
                        hitSlop={6}
                      >
                        <Ionicons
                          name={row.checked ? "checkbox" : "square-outline"}
                          size={22}
                          color={row.checked ? colors.accent : colors.textSubtle}
                        />
                      </Pressable>
                      <InitialsAvatar name={row.name} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.detectedName,
                            { color: colors.text },
                            !row.checked && {
                              textDecorationLine: "line-through",
                              color: colors.textMuted,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {row.name}
                        </Text>
                        <View style={styles.qtyRow}>
                          <TextInput
                            style={[
                              styles.qtyInput,
                              { color: colors.text, borderColor: colors.surfaceBorder },
                            ]}
                            value={row.quantity}
                            onChangeText={(v) =>
                              updateGroupRow(i, {
                                quantity: v.replace(/[^0-9.]/g, ""),
                              })
                            }
                            keyboardType="decimal-pad"
                            placeholder="qty"
                            placeholderTextColor={colors.placeholder}
                          />
                          <UnitPicker
                            value={row.unit}
                            onChange={(u) => updateGroupRow(i, { unit: u })}
                            colors={colors}
                          />
                        </View>
                      </View>
                      <Pressable onPress={() => removeGroupRow(i)} hitSlop={6}>
                        <Ionicons name="close" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ))}

                  <View style={styles.extraRow}>
                    <TextInput
                      style={[
                        styles.extraInput,
                        { color: colors.text, borderColor: colors.surfaceBorder },
                      ]}
                      value={extraName}
                      onChangeText={setExtraName}
                      placeholder="Anything I missed?"
                      placeholderTextColor={colors.placeholder}
                      onSubmitEditing={addExtra}
                    />
                    <Pressable
                      onPress={addExtra}
                      style={({ pressed }) => [
                        styles.addExtraBtn,
                        { backgroundColor: colors.accent },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Ionicons name="add" size={18} color={colors.accentText} />
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={saveAllGroup}
                    disabled={groupSaving}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: colors.accent, marginTop: 4 },
                      (pressed || groupSaving) && { opacity: 0.85 },
                    ]}
                  >
                    {groupSaving ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Ionicons name="cloud-upload" size={18} color={colors.accentText} />
                    )}
                    <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                      {groupSaving ? "Saving..." : "Add all to pantry"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {method === "single" && (
            <>
              <Pressable
                onPress={() => openCameraFor({ kind: "single" })}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.accent },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="camera" size={20} color={colors.accentText} />
                <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                  Scan one item
                </Text>
              </Pressable>

              {(singleName.length > 0 || singleResolved) && (
                <View
                  style={[
                    styles.singleEditCard,
                    { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                  ]}
                >
                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    Product name
                  </Text>
                  <TextInput
                    style={[
                      styles.fieldInput,
                      { color: colors.text, borderColor: colors.surfaceBorder },
                    ]}
                    value={singleName}
                    onChangeText={(v) => {
                      setSingleName(v);
                      // If user edits the name, drop the resolution so they
                      // re-look-up before saving.
                      if (singleResolved) setSingleResolved(null);
                    }}
                    placeholder="Type the actual product name"
                    placeholderTextColor={colors.placeholder}
                  />

                  <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    Quantity purchased
                  </Text>
                  <View style={styles.qtyRow}>
                    <TextInput
                      style={[
                        styles.qtyInput,
                        { color: colors.text, borderColor: colors.surfaceBorder, flex: 1 },
                      ]}
                      value={singleQty}
                      onChangeText={(v) =>
                        setSingleQty(v.replace(/[^0-9.]/g, ""))
                      }
                      keyboardType="decimal-pad"
                      placeholder="e.g. 12"
                      placeholderTextColor={colors.placeholder}
                    />
                    <UnitPicker
                      value={singleUnit}
                      onChange={setSingleUnit}
                      colors={colors}
                    />
                  </View>

                  <View style={styles.singleActionRow}>
                    <Pressable
                      onPress={lookupSingle}
                      disabled={singleLoading}
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        { borderColor: colors.accent },
                        (pressed || singleLoading) && { opacity: 0.85 },
                      ]}
                    >
                      {singleLoading ? (
                        <ActivityIndicator color={colors.accent} size="small" />
                      ) : (
                        <Ionicons name="search" size={16} color={colors.accent} />
                      )}
                      <Text style={[styles.secondaryBtnText, { color: colors.accent }]}>
                        Look up
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openCameraFor({ kind: "label" })}
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        { borderColor: colors.surfaceBorder },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Ionicons name="camera-outline" size={16} color={colors.text} />
                      <Text style={[styles.secondaryBtnText, { color: colors.text }]}>
                        Nutrition label
                      </Text>
                    </Pressable>
                  </View>

                  {singleResolved && (
                    <NutritionPreview resolved={singleResolved} colors={colors} />
                  )}

                  <Pressable
                    onPress={saveSingle}
                    disabled={singleSaving}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: colors.accent, marginTop: 8 },
                      (pressed || singleSaving) && { opacity: 0.85 },
                    ]}
                  >
                    {singleSaving ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accentText} />
                    )}
                    <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                      Save to pantry
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {method === "type" && (
            <>
              <View style={styles.typeRow}>
                <TextInput
                  style={[
                    styles.typeInput,
                    { color: colors.text, borderColor: colors.surfaceBorder },
                  ]}
                  value={typedName}
                  onChangeText={setTypedName}
                  placeholder="e.g. eggs, basmati rice 5kg, amul ghee"
                  placeholderTextColor={colors.placeholder}
                  onSubmitEditing={lookupTyped}
                />
                <Pressable
                  onPress={lookupTyped}
                  disabled={typedLoading}
                  style={({ pressed }) => [
                    styles.lookupBtn,
                    { backgroundColor: colors.accent },
                    (pressed || typedLoading) && { opacity: 0.85 },
                  ]}
                >
                  {typedLoading ? (
                    <ActivityIndicator color={colors.accentText} size="small" />
                  ) : (
                    <Text style={{ color: colors.accentText, fontWeight: "800" }}>
                      Look up
                    </Text>
                  )}
                </Pressable>
              </View>

              {typedResolved && (
                <View
                  style={[
                    styles.typedSaveCard,
                    { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
                  ]}
                >
                  <NutritionPreview resolved={typedResolved} colors={colors} />

                  <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 8 }]}>
                    How many did you buy?
                  </Text>
                  <View style={styles.qtyRow}>
                    <TextInput
                      style={[
                        styles.qtyInput,
                        { color: colors.text, borderColor: colors.surfaceBorder, flex: 1 },
                      ]}
                      value={typedQty}
                      onChangeText={(v) =>
                        setTypedQty(v.replace(/[^0-9.]/g, ""))
                      }
                      keyboardType="decimal-pad"
                      placeholder="e.g. 12"
                      placeholderTextColor={colors.placeholder}
                    />
                    <UnitPicker
                      value={typedUnit}
                      onChange={setTypedUnit}
                      colors={colors}
                    />
                  </View>

                  <Pressable
                    onPress={saveTyped}
                    disabled={typedSaving}
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: colors.accent, marginTop: 8 },
                      (pressed || typedSaving) && { opacity: 0.85 },
                    ]}
                  >
                    {typedSaving ? (
                      <ActivityIndicator color={colors.accentText} />
                    ) : (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accentText} />
                    )}
                    <Text style={[styles.primaryBtnText, { color: colors.accentText }]}>
                      Save to pantry
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Camera modal */}
        <Modal
          visible={!!cameraTarget}
          animationType="slide"
          onRequestClose={() => setCameraTarget(null)}
        >
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            <View style={cameraStyles.instruction}>
              <Text style={cameraStyles.instructionText}>
                {cameraTarget?.kind === "group"
                  ? "Lay all items on a flat surface and capture them in one shot."
                  : cameraTarget?.kind === "single"
                  ? "Frame the front of the package."
                  : "Frame the nutrition label clearly."}
              </Text>
            </View>
            {permission?.granted ? (
              <CameraView ref={cameraRef} style={{ flex: 1 }} />
            ) : (
              <View style={cameraStyles.fallback}>
                <Ionicons name="camera" size={48} color="#FFF" />
                <Text style={{ color: "#FFF", marginTop: 12 }}>
                  Camera unavailable
                </Text>
              </View>
            )}
            <View style={cameraStyles.controls}>
              <Pressable onPress={() => setCameraTarget(null)} style={cameraStyles.cancel}>
                <Text style={cameraStyles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleCapture} style={cameraStyles.shutter}>
                <View style={cameraStyles.shutterInner} />
              </Pressable>
              <View style={{ width: 80 }} />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────────
// Three-option duplicate prompt
// ───────────────────────────────────────────────────────────────────

function promptDuplicate(params: {
  existing: PantryItem;
  onChoose: (strategy: SaveStrategy) => Promise<void>;
}) {
  const remaining = params.existing.quantity_remaining ?? 0;
  const unit =
    params.existing.total_package_unit ?? params.existing.serving_unit ?? "";
  Alert.alert(
    `${params.existing.name} is already in your pantry.`,
    `Currently ~${formatRem(remaining)}${unit ? ` ${unit}` : ""} left.`,
    [
      {
        text: "Add to existing",
        onPress: () => params.onChoose("add_to_existing"),
      },
      {
        text: "Replace",
        onPress: () => params.onChoose("replace"),
      },
      {
        text: "Skip",
        style: "cancel",
        onPress: () => params.onChoose("skip"),
      },
    ],
  );
}

function formatRem(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// ───────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────

function UnitPicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (u: string) => void;
  colors: Palette;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          unitStyles.btn,
          { borderColor: colors.surfaceBorder, backgroundColor: colors.background },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={{ color: colors.text, fontWeight: "700" }}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={unitStyles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              unitStyles.sheet,
              { backgroundColor: colors.background, borderColor: colors.surfaceBorder },
            ]}
          >
            <ScrollView contentContainerStyle={{ paddingVertical: 6 }}>
              {COMMON_UNITS.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => {
                    onChange(u);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    unitStyles.row,
                    pressed && { backgroundColor: colors.surface },
                  ]}
                >
                  <Text
                    style={{
                      color: u === value ? colors.accent : colors.text,
                      fontWeight: u === value ? "800" : "600",
                      fontSize: 15,
                    }}
                  >
                    {u}
                  </Text>
                  {u === value && (
                    <Ionicons name="checkmark" size={16} color={colors.accent} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function MethodTab({
  label,
  icon,
  active,
  onPress,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  colors: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tabStyles.btn,
        {
          backgroundColor: active ? colors.accent : "transparent",
          borderColor: active ? colors.accent : colors.surfaceBorder,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? colors.accentText : colors.textMuted}
      />
      <Text
        style={[
          tabStyles.label,
          { color: active ? colors.accentText : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NutritionPreview({
  resolved,
  colors,
}: {
  resolved: ResolvedHaulItem;
  colors: Palette;
}) {
  const f = resolved.serving_size > 0 ? resolved.serving_size / 100 : 1;
  return (
    <View style={[previewStyles.card, { backgroundColor: colors.background, borderColor: colors.surfaceBorder }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <InitialsAvatar name={resolved.name} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={[previewStyles.name, { color: colors.text }]}>
            {resolved.name}
          </Text>
          {resolved.brand ? (
            <Text style={[previewStyles.brand, { color: colors.textMuted }]}>
              {resolved.brand}
            </Text>
          ) : null}
        </View>
        <SourceBadge source={resolved.source} />
      </View>
      <View style={previewStyles.macroRow}>
        <Macro label="Cal" value={Math.round(resolved.calories_per_100g * f)} colors={colors} />
        <Macro label="P" value={Math.round(resolved.protein_per_100g * f)} colors={colors} />
        <Macro label="C" value={Math.round(resolved.carbs_per_100g * f)} colors={colors} />
        <Macro label="F" value={Math.round(resolved.fat_per_100g * f)} colors={colors} />
      </View>
      <Text style={[previewStyles.servingNote, { color: colors.textSubtle }]}>
        per 1 {resolved.serving_unit} ({Math.round(resolved.serving_size)}g)
      </Text>
    </View>
  );
}

function Macro({ label, value, colors }: { label: string; value: number; colors: Palette }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function SourceBadge({ source }: { source: ResolvedHaulItem["source"] }) {
  let label: string;
  let bg: string;
  let fg: string;
  if (source === "label_verified") {
    label = "Label";
    bg = "#DCFCE7";
    fg = "#166534";
  } else if (source === "api_lookup") {
    label = "API";
    bg = "#DBEAFE";
    fg = "#1E40AF";
  } else if (source === "ai_estimated") {
    label = "AI estimate";
    bg = "#FEF3C7";
    fg = "#92400E";
  } else {
    label = "Common";
    bg = "#E0E7FF";
    fg = "#3730A3";
  }
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: fg, fontSize: 11, fontWeight: "800" }}>
        {label}
      </Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────

const tabStyles = StyleSheet.create({
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: "700" },
});

const previewStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginTop: 10,
  },
  name: { fontSize: 16, fontWeight: "800" },
  brand: { fontSize: 12, fontWeight: "600" },
  macroRow: { flexDirection: "row", marginTop: 4 },
  servingNote: { fontSize: 12, fontWeight: "600", marginTop: 4 },
});

const unitStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 86,
    justifyContent: "space-between",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    paddingHorizontal: 60,
  },
  sheet: {
    borderRadius: 14,
    borderWidth: 1,
    maxHeight: 360,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});

const cameraStyles = StyleSheet.create({
  instruction: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  instructionText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: "#000",
  },
  cancel: { width: 80 },
  cancelText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFF",
  },
});

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: c.text },
    tabRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 4,
    },
    scroll: {
      padding: 20,
      paddingBottom: 64,
      gap: 14,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
    },
    primaryBtnText: { fontSize: 15, fontWeight: "800" },
    secondaryBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
    },
    secondaryBtnText: { fontSize: 13, fontWeight: "800" },

    checklist: { gap: 10 },
    checklistTitle: { fontSize: 14, fontWeight: "800", marginTop: 4 },
    detectedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    detectedName: { fontSize: 16, fontWeight: "700" },
    qtyRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 },
    qtyInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      fontWeight: "700",
      width: 80,
    },
    extraRow: { flexDirection: "row", gap: 8, marginTop: 6 },
    extraInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    addExtraBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },

    fieldLabel: {
      fontSize: 12,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginTop: 4,
    },
    fieldInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
    },

    singleEditCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      gap: 8,
    },
    singleActionRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },

    typeRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
    typeInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
    },
    lookupBtn: {
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },

    typedSaveCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      gap: 8,
    },
  });
