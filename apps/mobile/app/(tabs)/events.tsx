import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";

import { track } from "../../src/analytics";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { Empty, ErrorState, Loading, Page } from "../../src/ui";

const tabs = ["Upcoming", "My Network", "My Events", "Past"] as const;
export default function Events() {
  const { api } = useAuth(); const { colors } = useTheme(); const router = useRouter(); const [tab, setTab] = useState<(typeof tabs)[number]>("Upcoming"); const [events, setEvents] = useState<any[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const params = tab === "Past" ? "when=past" : tab === "My Events" ? "scope=mine" : tab === "My Network" ? "scope=network" : "when=upcoming"; const data = await api.request(`/events?${params}`); setEvents(data.events); setError(""); } catch { setError("Events could not be loaded."); } finally { setLoading(false); } }, [api, tab]);
  useFocusEffect(useCallback(() => { void load(); void track(api, "navigation_events"); }, [load, api]));
  return <Page title="Events" subtitle="Shows, openings and gatherings across your network." refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.text}/>}><View style={{ flexDirection: "row", gap: 4 }}>{tabs.map((item) => <Pressable key={item} onPress={() => setTab(item)} style={{ flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center", borderBottomWidth: tab === item ? 2 : 0, borderColor: colors.text }}><Text style={{ color: tab === item ? colors.text : colors.textMuted, fontSize: 10.5, fontWeight: "600" }}>{item}</Text></Pressable>)}</View>{error ? <ErrorState message={error} retry={load}/> : loading && !events.length ? <Loading/> : events.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{events.map((event) => <Pressable key={event.id} onPress={() => router.push(`/events/${event.id}` as never)} style={{ width: "48.7%", gap: 5, marginBottom: 10 }}><Image source={event.coverImageUrl || undefined} style={{ width: "100%", aspectRatio: 4 / 5, backgroundColor: colors.surfaceMuted, borderRadius: 6 }} contentFit="cover"/><Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={2}>{event.title}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{new Date(event.startAt).toLocaleDateString()} · {event.city || "Online"}</Text></Pressable>)}</View> : <Empty text={`No ${tab.toLowerCase()} events.`} action={tab === "My Events" ? "Create event" : tab === "My Network" ? "Find organizers" : undefined} onAction={tab === "My Events" ? () => router.push("/create/event") : tab === "My Network" ? () => router.push("/network") : undefined}/>}</Page>;
}
