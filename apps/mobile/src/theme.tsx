import AsyncStorage from "@react-native-async-storage/async-storage";
import { artclubTokens } from "@artclub/design-tokens";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export type ThemePreference = "light" | "dark" | "system";
const ThemeContext = createContext<any>(null);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); const [preference, setPreferenceState] = useState<ThemePreference>("system");
  useEffect(() => { AsyncStorage.getItem("artclub:theme").then((value) => { if (["light", "dark", "system"].includes(value || "")) setPreferenceState(value as ThemePreference); }); }, []);
  const mode = preference === "system" ? (system === "dark" ? "dark" : "light") : preference; const colors = artclubTokens.color[mode];
  const value = useMemo(() => ({ preference, mode, colors, tokens: artclubTokens, setPreference: (next: ThemePreference) => { setPreferenceState(next); void AsyncStorage.setItem("artclub:theme", next); } }), [colors, mode, preference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("ThemeProvider missing"); return value as { preference: ThemePreference; mode: "light" | "dark"; colors: typeof artclubTokens.color.light; tokens: typeof artclubTokens; setPreference: (value: ThemePreference) => void }; }
