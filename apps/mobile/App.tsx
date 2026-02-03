import "react-native-gesture-handler";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DefaultTheme,
  NavigationContainer,
  NavigationProp,
  useNavigation
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { createMobileApiClient } from "@artclub/api-client";
import type { Artwork, FeedItem } from "@artclub/models";

type RootStackParamList = {
  Tabs: undefined;
  ArtworkDetail: { id: string };
};

type TabParamList = {
  Feed: undefined;
  Saved: undefined;
  Profile: undefined;
};

type FeedResponse = {
  items: FeedItem[];
  nextCursor?: string;
};

type AppContextValue = {
  baseUrl: string;
  useMock: boolean;
  setUseMock: (value: boolean) => void;
  feedItems: FeedItem[];
  refreshFeed: () => void;
  loadMore: () => void;
  isLoading: boolean;
  isRefreshing: boolean;
  error?: string;
  savedIds: string[];
  isSaved: (id: string) => boolean;
  toggleSaved: (id: string) => void;
  getArtwork: (id: string) => Promise<Artwork | null>;
  cacheArtwork: (artwork: Artwork) => void;
};

const STORAGE_KEYS = {
  saved: "artclub:saved-artworks",
  useMock: "artclub:use-mock"
};

const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const ENV_USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK;
const DEFAULT_USE_MOCK = ENV_USE_MOCK ? ENV_USE_MOCK === "true" : !DEFAULT_BASE_URL;

const AppContext = React.createContext<AppContextValue | null>(null);

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#F7F5F2",
    card: "#F7F5F2",
    text: "#121212",
    border: "rgba(0,0,0,0.08)"
  }
};

function useAppContext() {
  const context = React.useContext(AppContext);
  if (!context) throw new Error("AppContext not available");
  return context;
}

function AppProvider({ children }: { children: React.ReactNode }) {
  const [useMock, setUseMock] = useState(DEFAULT_USE_MOCK);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  const artworkCacheRef = useRef<Map<string, Artwork>>(new Map());
  const nextCursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);

  const client = useMemo(
    () =>
      createMobileApiClient({
        baseUrl: DEFAULT_BASE_URL,
        useMock
      }),
    [useMock]
  );

  const cacheArtwork = useCallback((artwork: Artwork) => {
    artworkCacheRef.current.set(artwork.id, artwork);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadStored() {
      try {
        const [storedSaved, storedMock] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.saved),
          AsyncStorage.getItem(STORAGE_KEYS.useMock)
        ]);

        if (!active) return;

        if (storedSaved) {
          const parsed = JSON.parse(storedSaved);
          if (Array.isArray(parsed)) {
            setSavedIds(parsed.filter((item) => typeof item === "string"));
          }
        }

        if (storedMock !== null) {
          setUseMock(storedMock === "true");
        }
      } catch {
        // ignore storage failures
      } finally {
        if (active) setReady(true);
      }
    }

    loadStored();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(savedIds)).catch(() => undefined);
  }, [ready, savedIds]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEYS.useMock, useMock ? "true" : "false").catch(() => undefined);
  }, [ready, useMock]);

  const isSaved = useCallback((id: string) => savedIds.includes(id), [savedIds]);

  const toggleSaved = useCallback((id: string) => {
    setSavedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [id, ...prev];
    });
  }, []);

  const getArtwork = useCallback(
    async (id: string) => {
      const cached = artworkCacheRef.current.get(id);
      if (cached) return cached;
      if (!useMock && !DEFAULT_BASE_URL) {
        setError("Missing API base URL");
        return null;
      }
      try {
        const artwork = await client.getArtwork(id);
        cacheArtwork(artwork);
        return artwork;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artwork");
        return null;
      }
    },
    [cacheArtwork, client, useMock]
  );

  const loadFeed = useCallback(
    async (mode: "refresh" | "more") => {
      if (!useMock && !DEFAULT_BASE_URL) {
        setError("Missing API base URL");
        return;
      }
      const currentCursor = nextCursorRef.current;
      if (mode === "more" && (!currentCursor || loadingRef.current)) return;
      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      loadingRef.current = true;
      setError(undefined);
      try {
        const cursor = mode === "refresh" ? undefined : currentCursor;
        const response = (await client.getFeed(cursor)) as FeedResponse;
        setFeedItems((prev) =>
          mode === "refresh" ? response.items : [...prev, ...response.items]
        );
        setNextCursor(response.nextCursor);
        nextCursorRef.current = response.nextCursor;
        response.items.forEach((item) => cacheArtwork(item.artwork));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load feed");
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [cacheArtwork, client, useMock]
  );

  const refreshFeed = useCallback(() => {
    loadFeed("refresh");
  }, [loadFeed]);

  const loadMore = useCallback(() => {
    loadFeed("more");
  }, [loadFeed]);

  useEffect(() => {
    if (!ready) return;
    setFeedItems([]);
    setNextCursor(undefined);
    nextCursorRef.current = undefined;
    void loadFeed("refresh");
  }, [ready, loadFeed, useMock]);

  const value = useMemo<AppContextValue>(
    () => ({
      baseUrl: DEFAULT_BASE_URL,
      useMock,
      setUseMock,
      feedItems,
      refreshFeed,
      loadMore,
      isLoading,
      isRefreshing,
      error,
      savedIds,
      isSaved,
      toggleSaved,
      getArtwork,
      cacheArtwork
    }),
    [
      useMock,
      feedItems,
      refreshFeed,
      loadMore,
      isLoading,
      isRefreshing,
      error,
      savedIds,
      isSaved,
      toggleSaved,
      getArtwork,
      cacheArtwork
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function FeedScreen() {
  const {
    feedItems,
    isLoading,
    isRefreshing,
    error,
    refreshFeed,
    loadMore,
    toggleSaved,
    isSaved
  } = useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [listHeight, setListHeight] = useState(height);
  const [reactedIds, setReactedIds] = useState<Record<string, boolean>>({});

  const toggleReacted = useCallback((id: string) => {
    setReactedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const prefetchAround = useCallback(
    (index: number) => {
      for (let offset = 1; offset <= 2; offset += 1) {
        const url = feedItems[index + offset]?.artwork.media[0]?.url;
        if (url) {
          void Image.prefetch(url);
        }
      }
    },
    [feedItems]
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const firstIndex = viewableItems[0]?.index ?? 0;
      if (firstIndex !== null) prefetchAround(firstIndex);
    }
  ).current;

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      const artwork = item.artwork;
      const imageUrl =
        artwork.media[0]?.url || "https://picsum.photos/seed/placeholder/1200/1600";
      const saved = isSaved(artwork.id);
      const reacted = Boolean(reactedIds[artwork.id]);

      return (
        <Pressable
          onPress={() => navigation.navigate("ArtworkDetail", { id: artwork.id })}
          style={[styles.feedItem, { height: listHeight }]}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.feedImage}
            contentFit="cover"
            transition={180}
            cachePolicy="memory-disk"
          />
          <View style={styles.feedOverlay} />
          <View
            style={[
              styles.feedContent,
              { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 }
            ]}
          >
            <View>
              <Text style={styles.feedTitle}>{artwork.title}</Text>
              {artwork.artistName ? (
                <Text style={styles.feedArtist}>{artwork.artistName}</Text>
              ) : null}
            </View>
            <View style={styles.feedActions}>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  toggleSaved(artwork.id);
                }}
                style={[styles.actionButton, saved && styles.actionButtonActive]}
              >
                <Text style={[styles.actionText, saved && styles.actionTextActive]}>
                  {saved ? "Saved" : "Save"}
                </Text>
              </Pressable>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  toggleReacted(artwork.id);
                }}
                style={[styles.actionButton, reacted && styles.actionButtonActive]}
              >
                <Text style={[styles.actionText, reacted && styles.actionTextActive]}>
                  {reacted ? "Reacted" : "React"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      );
    },
    [insets.bottom, insets.top, isSaved, listHeight, navigation, reactedIds, toggleSaved, toggleReacted]
  );

  if (error && feedItems.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Could not load feed</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={refreshFeed} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex} onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}>
      <FlatList
        data={feedItems}
        keyExtractor={(item) => item.artwork.id}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshFeed} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator />
            </View>
          ) : null
        }
      />
    </View>
  );
}

function ArtworkDetailScreen({
  route
}: {
  route: { params: { id: string } };
}) {
  const { id } = route.params;
  const { getArtwork, toggleSaved, isSaved } = useAppContext();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    async function loadArtwork() {
      setLoading(true);
      const result = await getArtwork(id);
      if (!active) return;
      if (!result) {
        setError("Unable to load artwork.");
        setLoading(false);
        return;
      }
      setArtwork(result);
      setError(undefined);
      setLoading(false);
    }

    loadArtwork();
    return () => {
      active = false;
    };
  }, [getArtwork, id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !artwork) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Artwork unavailable</Text>
        <Text style={styles.errorText}>{error ?? "Try again later."}</Text>
      </View>
    );
  }

  const saved = isSaved(artwork.id);
  const media = artwork.media.length ? artwork.media : [];

  return (
    <ScrollView
      style={styles.detailContainer}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      {media.length > 0 ? (
        <FlatList
          data={media}
          keyExtractor={(item, index) => `${artwork.id}-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.url }}
              style={{ width, height: Math.min(width * 1.2, 520) }}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
            />
          )}
        />
      ) : null}

      <View style={styles.detailContent}>
        <Text style={styles.detailTitle}>{artwork.title}</Text>
        {artwork.artistName ? (
          <Text style={styles.detailArtist}>{artwork.artistName}</Text>
        ) : null}

        <View style={styles.detailMeta}>
          {artwork.widthCm && artwork.heightCm ? (
            <Text style={styles.detailMetaText}>
              {artwork.widthCm}cm x {artwork.heightCm}cm
            </Text>
          ) : null}
          {typeof artwork.priceEur === "number" ? (
            <Text style={styles.detailMetaText}>€{formatPrice(artwork.priceEur)}</Text>
          ) : null}
          {typeof artwork.isOriginal === "boolean" ? (
            <Text style={styles.detailMetaText}>
              {artwork.isOriginal ? "Original" : "Print"}
            </Text>
          ) : null}
        </View>

        {artwork.shortDescription ? (
          <Text style={styles.detailDescription}>{artwork.shortDescription}</Text>
        ) : null}

        <Pressable
          onPress={() => toggleSaved(artwork.id)}
          style={[styles.primaryButton, saved && styles.primaryButtonActive]}
        >
          <Text style={[styles.primaryButtonText, saved && styles.primaryButtonTextActive]}>
            {saved ? "Saved" : "Save"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function SavedScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { savedIds, getArtwork, toggleSaved } = useAppContext();
  const [savedArtworks, setSavedArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSaved() {
      if (savedIds.length === 0) {
        setSavedArtworks([]);
        return;
      }
      setLoading(true);
      const results = await Promise.all(savedIds.map((id) => getArtwork(id)));
      if (!active) return;
      setSavedArtworks(results.filter((item): item is Artwork => Boolean(item)));
      setLoading(false);
    }

    loadSaved();
    return () => {
      active = false;
    };
  }, [getArtwork, savedIds]);

  if (savedIds.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No saved artworks yet</Text>
        <Text style={styles.emptyText}>Tap Save in the feed to build your collection.</Text>
      </View>
    );
  }

  return (
    <View style={styles.savedContainer}>
      {loading ? <ActivityIndicator style={styles.savedLoader} /> : null}
      <FlatList
        data={savedArtworks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.savedList}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("ArtworkDetail", { id: item.id })}
            style={styles.savedCard}
          >
            <Image
              source={{ uri: item.media[0]?.url ?? "https://picsum.photos/seed/saved/600/600" }}
              style={styles.savedImage}
              contentFit="cover"
              transition={160}
              cachePolicy="memory-disk"
            />
            <View style={styles.savedInfo}>
              <Text style={styles.savedTitle}>{item.title}</Text>
              {item.artistName ? (
                <Text style={styles.savedArtist}>{item.artistName}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={(event) => {
                event.stopPropagation?.();
                toggleSaved(item.id);
              }}
              style={styles.savedRemoveButton}
            >
              <Text style={styles.savedRemoveText}>Remove</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

function ProfileScreen() {
  const { baseUrl, useMock, setUseMock } = useAppContext();
  return (
    <View style={styles.profileContainer}>
      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>API Base URL</Text>
        <Text style={styles.profileValue}>{baseUrl || "Not set"}</Text>
      </View>
      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>Mock Mode</Text>
        <View style={styles.profileRow}>
          <Text style={styles.profileValue}>{useMock ? "Enabled" : "Disabled"}</Text>
          <Switch value={useMock} onValueChange={setUseMock} />
        </View>
      </View>
      <Text style={styles.profileHint}>
        Toggle mock mode to reload the feed with local placeholder data.
      </Text>
    </View>
  );
}

function TabNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel
      }}
    >
      <Tabs.Screen name="Feed" component={FeedScreen} />
      <Tabs.Screen name="Saved" component={SavedScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer theme={NAV_THEME}>
          <StatusBar style="dark" />
          <Stack.Navigator
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: NAV_THEME.colors.card },
              headerTitleStyle: { fontWeight: "600" }
            }}
          >
            <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
            <Stack.Screen name="ArtworkDetail" component={ArtworkDetailScreen} options={{ title: "" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}

function formatPrice(value: number) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 0 });
}

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: NAV_THEME.colors.background
  },
  feedItem: {
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "#0E0E0E"
  },
  feedImage: {
    ...StyleSheet.absoluteFillObject
  },
  feedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)"
  },
  feedContent: {
    paddingHorizontal: 20,
    gap: 12,
    justifyContent: "space-between",
    height: "100%"
  },
  feedTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700"
  },
  feedArtist: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 16,
    marginTop: 6
  },
  feedActions: {
    flexDirection: "row",
    gap: 12
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.15)"
  },
  actionButtonActive: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(255,255,255,0.92)"
  },
  actionText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  actionTextActive: {
    color: "#0B0B0B"
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#151515",
    marginBottom: 8,
    textAlign: "center"
  },
  errorText: {
    color: "#5C5C5C",
    textAlign: "center"
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#151515"
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  detailContainer: {
    flex: 1,
    backgroundColor: NAV_THEME.colors.background
  },
  detailContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 16
  },
  detailTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#121212"
  },
  detailArtist: {
    color: "#5C5C5C",
    fontSize: 16
  },
  detailMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  detailMetaText: {
    fontSize: 14,
    color: "#3F3F3F"
  },
  detailDescription: {
    fontSize: 15,
    color: "#4B4B4B",
    lineHeight: 22
  },
  primaryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111111"
  },
  primaryButtonActive: {
    backgroundColor: "#F1EDE6"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  primaryButtonTextActive: {
    color: "#111111"
  },
  savedContainer: {
    flex: 1,
    backgroundColor: NAV_THEME.colors.background
  },
  savedList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12
  },
  savedCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  savedImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "#E6E1DC"
  },
  savedInfo: {
    flex: 1,
    marginLeft: 14
  },
  savedTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#151515"
  },
  savedArtist: {
    marginTop: 4,
    fontSize: 13,
    color: "#6A6A6A"
  },
  savedRemoveButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)"
  },
  savedRemoveText: {
    fontSize: 12,
    color: "#2A2A2A"
  },
  savedLoader: {
    marginVertical: 12
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1C"
  },
  emptyText: {
    marginTop: 6,
    color: "#6B6B6B",
    textAlign: "center"
  },
  profileContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: NAV_THEME.colors.background,
    gap: 16
  },
  profileCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    gap: 8
  },
  profileLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#7A7A7A"
  },
  profileValue: {
    fontSize: 15,
    color: "#1A1A1A",
    fontWeight: "600"
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  profileHint: {
    color: "#6B6B6B",
    fontSize: 13,
    lineHeight: 18
  },
  tabBar: {
    backgroundColor: "#F7F5F2",
    borderTopColor: "rgba(0,0,0,0.08)"
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600"
  }
});
