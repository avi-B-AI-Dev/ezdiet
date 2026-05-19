import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import InitialsAvatar from "@/components/InitialsAvatar";
import {
  estimateRemainingDisplay,
  formatServingDisplay,
  listPantryItems,
  type PantryCategory,
  type PantryItem,
  type PantrySource,
} from "@/lib/db";
import { Palette, useTheme } from "@/lib/theme";

type Filter = "all" | "packaged" | "fresh" | "low_stock";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "packaged", label: "Packaged" },
  { key: "fresh", label: "Fresh" },
  { key: "low_stock", label: "Low Stock" },
];

// Fresh: dairy / vegetable / fruit / protein (eggs, fresh meat, fish).
const FRESH_CATEGORIES = new Set<PantryCategory>([
  "vegetable",
  "fruit",
  "dairy",
  "protein",
]);

// Packaged: dry goods, sealed staples, oils, spices, anything with a brand.
const PACKAGED_CATEGORIES = new Set<PantryCategory>([
  "grain",
  "packaged",
  "oil",
  "spice",
]);

function isPackaged(item: PantryItem): boolean {
  if (item.category && PACKAGED_CATEGORIES.has(item.category)) return true;
  if (item.brand && item.brand.trim().length > 0) return true;
  return false;
}

function isFresh(item: PantryItem): boolean {
  return !!(item.category && FRESH_CATEGORIES.has(item.category));
}

function isLowStock(item: PantryItem): boolean {
  if (item.quantity_purchased == null || item.quantity_purchased <= 0) return false;
  if (item.quantity_remaining == null) return false;
  return item.quantity_remaining < 0.2 * item.quantity_purchased;
}

export default function PantryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [items, setItems] = useState<PantryItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    const list = await listPantryItems();
    setItems(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filteredItems = useMemo(() => {
    let out = items;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.brand?.toLowerCase().includes(q) ?? false),
      );
    }
    if (filter === "packaged") out = out.filter(isPackaged);
    else if (filter === "fresh") out = out.filter(isFresh);
    else if (filter === "low_stock") out = out.filter(isLowStock);
    return out;
  }, [items, search, filter]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Title row */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Pantry</Text>
        <Pressable
          onPress={() => router.push("/pantry-add")}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="add" size={18} color={colors.accentText} />
          <Text style={[styles.addBtnText, { color: colors.accentText }]}>
            Add Items
          </Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search pantry..."
          placeholderTextColor={colors.placeholder}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={6}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Filter pills (small horizontal row) */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [
                styles.filterChip,
                {
                  backgroundColor: active ? colors.accent : "transparent",
                  borderColor: active ? colors.accent : colors.surfaceBorder,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? colors.accentText : colors.textMuted },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Item list */}
      {filteredItems.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons
            name="basket-outline"
            size={56}
            color={colors.textSubtle}
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {items.length === 0
              ? "Your pantry is empty"
              : "No items match this filter"}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            {items.length === 0
              ? "Tap Add Items to scan your groceries."
              : "Try a different filter or search."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {filteredItems.map((item) => (
            <PantryCard
              key={item.id}
              item={item}
              colors={colors}
              styles={styles}
              onPress={() =>
                router.push({
                  pathname: "/pantry-item",
                  params: { id: String(item.id) },
                })
              }
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────────
// Pantry card
// ───────────────────────────────────────────────────────────────────

type Styles = ReturnType<typeof makeStyles>;

function PantryCard({
  item,
  colors,
  styles,
  onPress,
}: {
  item: PantryItem;
  colors: Palette;
  styles: Styles;
  onPress: () => void;
}) {
  const remaining = estimateRemainingDisplay(item);
  const perServing = useMemo(() => {
    const f = item.serving_size > 0 ? item.serving_size / 100 : 1;
    return {
      cal: Math.round(item.calories_per_100g * f),
      protein: Math.round(item.protein_per_100g * f),
      carbs: Math.round(item.carbs_per_100g * f),
      fat: Math.round(item.fat_per_100g * f),
    };
  }, [item]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.85 },
      ]}
    >
      {/* Initials avatar (no camera photos) */}
      <InitialsAvatar name={item.name} size={64} />

      {/* Body */}
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.cardTitleRow}>
          <Text
            style={[styles.cardName, { color: colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <SourceBadge source={item.source} />
        </View>
        {item.brand && (
          <Text
            style={[styles.cardBrand, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {item.brand}
          </Text>
        )}
        <Text style={[styles.cardNutri, { color: colors.textMuted }]}>
          {perServing.cal} cal · P{perServing.protein} C{perServing.carbs} F
          {perServing.fat}{" "}
          <Text style={{ color: colors.textSubtle, fontSize: 12 }}>
            per {formatServingDisplay(item)}
          </Text>
        </Text>
        <View style={styles.cardFooter}>
          {remaining && (
            <Text
              style={[
                styles.remainingText,
                { color: remaining.isLow ? "#B45309" : colors.textMuted },
              ]}
            >
              {remaining.text}
            </Text>
          )}
          {remaining?.isLow && (
            <View style={styles.lowStockBadge}>
              <Ionicons name="alert-circle" size={11} color="#B45309" />
              <Text style={styles.lowStockText}>Low</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function SourceBadge({ source }: { source: PantrySource }) {
  let label: string;
  let bg: string;
  let fg: string;
  if (source === "label_verified" || source === "scanned") {
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },
    title: { color: c.text, fontSize: 26, fontWeight: "800" },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
    },
    addBtnText: { fontSize: 14, fontWeight: "800" },

    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginHorizontal: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
      backgroundColor: c.surface,
    },
    searchInput: { flex: 1, fontSize: 16, color: c.text },

    // Small horizontal pill row, ~40px tall, single row
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 4,
    },
    filterChip: {
      flex: 1,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
    },
    filterChipText: { fontSize: 13, fontWeight: "700" },

    scroll: { padding: 20, paddingBottom: 96, gap: 12 },

    card: {
      flexDirection: "row",
      gap: 14,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.surfaceBorder,
      backgroundColor: c.background,
      marginBottom: 12,
      alignItems: "center",
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    cardName: { fontSize: 18, fontWeight: "800", flexShrink: 1 },
    cardBrand: { fontSize: 13, fontWeight: "600" },
    cardNutri: { fontSize: 14, fontWeight: "600", marginTop: 2 },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    remainingText: { fontSize: 13, fontWeight: "700" },
    lowStockBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "#FEF3C7",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    lowStockText: { color: "#B45309", fontSize: 11, fontWeight: "800" },

    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
      gap: 8,
    },
    emptyTitle: { fontSize: 17, fontWeight: "800", marginTop: 4 },
    emptyBody: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
  });
