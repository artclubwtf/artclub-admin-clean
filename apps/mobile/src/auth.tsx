import { createNetworkApiClient } from "@artclub/api-client";
import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "artclub:network-token";
const AuthContext = createContext<any>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null); const [user, setUser] = useState<any>(null); const [profile, setProfile] = useState<any>(null); const [ready, setReady] = useState(false); const [onboardingRequired, setOnboardingRequired] = useState(false);
  const api = useMemo(() => createNetworkApiClient({ baseUrl: BASE_URL, prefix: "/api/mobile/v1/network", getAccessToken: () => token }), [token]);
  const refreshProfile = useCallback(async (accessToken = token) => { if (!accessToken || !BASE_URL) { setProfile(null); return null; } const response = await fetch(`${BASE_URL}/api/mobile/v1/network/profile`, { headers: { Authorization: `Bearer ${accessToken}` } }); if (response.status === 401) throw new Error("unauthorized"); const payload = await response.json(); setProfile(payload.profile); setOnboardingRequired(payload.onboardingRequired === true); return payload.profile; }, [token]);
  useEffect(() => { let active = true; (async () => { const stored = await SecureStore.getItemAsync(TOKEN_KEY); if (!active) return; if (stored && BASE_URL) { try { const response = await fetch(`${BASE_URL}/api/mobile/v1/me`, { headers: { Authorization: `Bearer ${stored}` } }); if (response.ok) { const payload = await response.json(); setToken(stored); setUser(payload.user); await refreshProfile(stored); } else await SecureStore.deleteItemAsync(TOKEN_KEY); } catch {} } setReady(true); })(); return () => { active = false; }; }, [refreshProfile]);
  async function authenticate(mode: "login" | "register", values: { email: string; password: string; name?: string }) { if (!BASE_URL) throw new Error("Set EXPO_PUBLIC_API_BASE_URL to connect ARTCLUB."); const response = await fetch(`${BASE_URL}/api/mobile/v1/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const payload = await response.json().catch(() => null); if (!response.ok || !payload?.token) throw new Error(payload?.error || "Authentication failed"); await SecureStore.setItemAsync(TOKEN_KEY, payload.token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); setToken(payload.token); setUser(payload.user); await refreshProfile(payload.token); }
  async function logout() { if (token && BASE_URL) await fetch(`${BASE_URL}/api/mobile/v1/me`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined); await SecureStore.deleteItemAsync(TOKEN_KEY); setToken(null); setUser(null); setProfile(null); setOnboardingRequired(false); }
  const value = useMemo(() => ({ ready, configured: Boolean(BASE_URL), token, user, profile, onboardingRequired, api, baseUrl: BASE_URL, login: (values: any) => authenticate("login", values), register: (values: any) => authenticate("register", values), logout, refreshProfile }), [api, onboardingRequired, profile, ready, token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider missing"); return value as any; }
