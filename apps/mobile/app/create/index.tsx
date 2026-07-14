import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { track } from "../../src/analytics";
import { useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";
import { Page, Section } from "../../src/ui";
const actions: Array<{ key: string; label: string; detail: string; icon: keyof typeof Ionicons.glyphMap; roles?: string[] }> = [
  { key: "update", label: "Post update", detail: "Share news, process or an image", icon: "create-outline" },
  { key: "process", label: "Share process", detail: "Publish process images or a short video", icon: "videocam-outline", roles: ["artist"] },
  { key: "event", label: "Create event", detail: "For artists, galleries and organizers", icon: "calendar-outline", roles: ["artist", "gallery", "event_series", "curator", "institution"] },
  { key: "artwork", label: "Add artwork", detail: "Create a draft product in Shopify", icon: "image-outline", roles: ["artist"] },
  { key: "collection", label: "Add to collection", detail: "Document an artwork in your collection", icon: "albums-outline", roles: ["collector", "art_enthusiast"] },
];
export default function Create() { const { profile, api } = useAuth(); const { colors } = useTheme(); const router = useRouter(); const visible = actions.filter((item) => !item.roles || item.roles.includes(profile?.profileType)); return <Page title="Create" subtitle="Choose what you want to add to your ARTCLUB identity."><Section title="Create new">{visible.map((item) => <Pressable key={item.key} onPress={() => { void track(api, "navigation_create", { destination: item.key }); router.push(`/create/${item.key}` as never); }} style={{ minHeight: 68, flexDirection: "row", alignItems: "center", gap: 13, borderBottomWidth: .5, borderColor: colors.border }}><View style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" }}><Ionicons name={item.icon} size={21} color={colors.text}/></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }}>{item.label}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.detail}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted}/></Pressable>)}</Section></Page>; }
