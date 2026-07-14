import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../src/auth";
import { ThemeProvider, useTheme } from "../src/theme";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }) });
function Navigator() { const { colors, mode } = useTheme(); const router = useRouter(); useEffect(() => { const subscription = Notifications.addNotificationResponseReceivedListener((response) => { const target = response.notification.request.content.data?.path; if (typeof target === "string" && target.startsWith("/")) router.push(target as never); }); return () => subscription.remove(); }, [router]); return <><StatusBar style={mode === "dark" ? "light" : "dark"}/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right" }}/></>; }
export default function RootLayout() { return <SafeAreaProvider><ThemeProvider><AuthProvider><Navigator/></AuthProvider></ThemeProvider></SafeAreaProvider>; }
