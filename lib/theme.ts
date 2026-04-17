import { useColorScheme } from "react-native";

export type Palette = {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  placeholder: string;
  accent: string;
  accentText: string;
};

export const lightPalette: Palette = {
  background: "#FFFFFF",
  surface: "#F1F5F9",
  surfaceBorder: "#E2E8F0",
  text: "#0F172A",
  textMuted: "#475569",
  textSubtle: "#94A3B8",
  placeholder: "#CBD5E1",
  accent: "#3B82F6",
  accentText: "#FFFFFF",
};

export const darkPalette: Palette = {
  background: "#0F172A",
  surface: "#1E293B",
  surfaceBorder: "#334155",
  text: "#F8FAFC",
  textMuted: "#CBD5E1",
  textSubtle: "#94A3B8",
  placeholder: "#475569",
  accent: "#3B82F6",
  accentText: "#FFFFFF",
};

export type Theme = {
  mode: "light" | "dark";
  colors: Palette;
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const mode = scheme === "dark" ? "dark" : "light";
  return {
    mode,
    colors: mode === "dark" ? darkPalette : lightPalette,
  };
}
