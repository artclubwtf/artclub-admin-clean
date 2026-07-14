import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";

import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { GlobalHeader, Loading } from "../../src/ui";

const icons: Record<string, keyof typeof Ionicons.glyphMap> = { home: "home-outline", network: "people-outline", messages: "chatbubble-outline", events: "calendar-outline", profile: "person-outline" };
export default function TabsLayout() { const { ready, token, onboardingRequired, api } = useAuth(); const { colors } = useTheme(); const [unread, setUnread] = useState(0); useEffect(() => { if (!token) return; const load = () => api.request("/notifications").then((data: any) => setUnread(data.unreadCount || 0)).catch(() => undefined); void load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [api, token]); if (!ready) return <Loading/>; if (!token) return <Redirect href="/login"/>; if (onboardingRequired) return <Redirect href="/onboarding"/>; return <Tabs screenOptions={({ route }) => ({ header: () => <GlobalHeader unread={unread}/>, tabBarActiveTintColor: colors.text, tabBarInactiveTintColor: colors.textMuted, tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: .5, elevation: 0, shadowOpacity: 0 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "500" }, tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] || "ellipse-outline"} size={size} color={color}/> })}><Tabs.Screen name="home" options={{ title: "Home" }}/><Tabs.Screen name="network" options={{ title: "Network" }}/><Tabs.Screen name="messages" options={{ title: "Messages" }}/><Tabs.Screen name="events" options={{ title: "Events" }}/><Tabs.Screen name="profile" options={{ title: "Profile" }}/></Tabs>; }
