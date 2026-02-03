import "react-native-gesture-handler";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
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
  LinkingOptions,
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

type FeedCachePayload = {
  items: FeedItem[];
  nextCursor?: string;
  savedAt: number;
};

type MobileUser = {
  id: string;
  email: string;
  name?: string;
};

type AuthMode = "login" | "register";
type ReactionEmoji = "🖤" | "🔥" | "👀" | "😵‍💫";

type AppContextValue = {
  baseUrl: string;
  useMock: boolean;
  setUseMock: (value: boolean) => void;
  token?: string;
  user?: MobileUser;
  authModalVisible: boolean;
  authMode: AuthMode;
  authBusy: boolean;
  authError?: string;
  showAuth: (mode?: AuthMode) => void;
  hideAuth: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  feedItems: FeedItem[];
  refreshFeed: () => void;
  loadMore: () => void;
  refreshSaved: () => void;
  isLoading: boolean;
  isRefreshing: boolean;
  error?: string;
  savedIds: string[];
  isSaved: (id: string) => boolean;
  toggleSaved: (id: string) => Promise<void>;
  reactedByArtwork: Record<string, ReactionEmoji>;
  openReactionPicker: (artwork: Artwork) => void;
  closeReactionPicker: () => void;
  submitReaction: (emoji: ReactionEmoji) => Promise<void>;
  reactionTarget?: Artwork | null;
  getArtwork: (id: string) => Promise<Artwork | null>;
  getArtworkForShare: (id: string) => Promise<Artwork | null>;
  cacheArtwork: (artwork: Artwork) => void;
};

const STORAGE_KEYS = {
  saved: "artclub:saved-artworks",
  useMock: "artclub:use-mock",
  feedCache: "artclub:feed-cache:v1",
  token: "artclub:auth-token",
  user: "artclub:auth-user"
};

const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const ENV_USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK;
const DEFAULT_USE_MOCK = ENV_USE_MOCK ? ENV_USE_MOCK === "true" : !DEFAULT_BASE_URL;
const WEB_PRODUCT_BASE_URL = "https://www.artclub.wtf/products";

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

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["artclub://"],
  config: {
    screens: {
      ArtworkDetail: "artwork/:id"
    }
  }
};

function AppProvider({ children }: { children: React.ReactNode }) {
  const [useMock, setUseMock] = useState(DEFAULT_USE_MOCK);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>(undefined);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<Artwork | null>(null);
  const [reactedByArtwork, setReactedByArtwork] = useState<Record<string, ReactionEmoji>>({});

  const artworkCacheRef = useRef<Map<string, Artwork>>(new Map());
  const feedItemsRef = useRef<FeedItem[]>([]);
  const savedIdsRef = useRef<string[]>([]);
  const nextCursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);

  const client = useMemo(
    () =>
      createMobileApiClient({
        baseUrl: DEFAULT_BASE_URL,
        useMock,
        token: token || undefined
      }),
    [useMock, token]
  );

  const cacheArtwork = useCallback((artwork: Artwork) => {
    artworkCacheRef.current.set(artwork.id, artwork);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadStored() {
      try {
        const [storedSaved, storedMock, storedFeed, storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.saved),
          AsyncStorage.getItem(STORAGE_KEYS.useMock),
          AsyncStorage.getItem(STORAGE_KEYS.feedCache),
          AsyncStorage.getItem(STORAGE_KEYS.token),
          AsyncStorage.getItem(STORAGE_KEYS.user)
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

        if (storedToken) {
          setToken(storedToken);
        }

        if (storedUser) {
          try {
            const parsed = JSON.parse(storedUser) as MobileUser;
            if (parsed?.id && parsed?.email) {
              setUser(parsed);
            }
          } catch {
            // ignore parse errors
          }
        }

        if (storedFeed) {
          const parsed = JSON.parse(storedFeed) as Partial<FeedCachePayload>;
          if (Array.isArray(parsed.items)) {
            setFeedItems(parsed.items);
            setNextCursor(parsed.nextCursor);
            nextCursorRef.current = parsed.nextCursor;
            parsed.items.forEach((item) => cacheArtwork(item.artwork));
          }
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
    feedItemsRef.current = feedItems;
  }, [feedItems]);

  useEffect(() => {
    savedIdsRef.current = savedIds;
  }, [savedIds]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(savedIds)).catch(() => undefined);
  }, [ready, savedIds]);

  useEffect(() => {
    if (!ready) return;
    if (token) {
      AsyncStorage.setItem(STORAGE_KEYS.token, token).catch(() => undefined);
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS.token).catch(() => undefined);
    }
  }, [ready, token]);

  useEffect(() => {
    if (!ready) return;
    if (user) {
      AsyncStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user)).catch(() => undefined);
    } else {
      AsyncStorage.removeItem(STORAGE_KEYS.user).catch(() => undefined);
    }
  }, [ready, user]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEYS.useMock, useMock ? "true" : "false").catch(() => undefined);
  }, [ready, useMock]);

  const isSaved = useCallback((id: string) => savedIds.includes(id), [savedIds]);

  const showAuth = useCallback((mode: AuthMode = "login") => {
    setAuthMode(mode);
    setAuthError(undefined);
    setAuthModalVisible(true);
  }, []);

  const hideAuth = useCallback(() => {
    setAuthModalVisible(false);
    setAuthError(undefined);
  }, []);

  const refreshSaved = useCallback(async () => {
    if (useMock) return;
    if (!token) return;
    try {
      const response = await client.listSaves();
      if (Array.isArray(response.productGids)) {
        setSavedIds(response.productGids);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved");
    }
  }, [client, token, useMock]);

  const login = useCallback(
    async (email: string, password: string) => {
      setAuthBusy(true);
      setAuthError(undefined);
      try {
        const result = await client.login({ email, password });
        setToken(result.token);
        setUser(result.user);
        setAuthModalVisible(false);
        await refreshSaved();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Login failed");
      } finally {
        setAuthBusy(false);
      }
    },
    [client, refreshSaved]
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      setAuthBusy(true);
      setAuthError(undefined);
      try {
        const result = await client.register({ email, password, name });
        setToken(result.token);
        setUser(result.user);
        setAuthModalVisible(false);
        await refreshSaved();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : "Registration failed");
      } finally {
        setAuthBusy(false);
      }
    },
    [client, refreshSaved]
  );

  useEffect(() => {
    if (!ready) return;
    if (useMock) return;
    if (!token) {
      setUser(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const response = await client.getMe();
        if (!active) return;
        if (response?.user) {
          setUser(response.user);
          await refreshSaved();
        } else {
          setUser(null);
          setToken(null);
        }
      } catch {
        if (!active) return;
        setUser(null);
        setToken(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, ready, refreshSaved, token, useMock]);

  const toggleSaved = useCallback(
    async (id: string) => {
      if (!useMock && !token) {
        showAuth("login");
        return;
      }
      const wasSaved = savedIdsRef.current.includes(id);
      setSavedIds((prev) => {
        if (wasSaved) return prev.filter((item) => item !== id);
        return [id, ...prev];
      });

      if (useMock) return;
      try {
        await client.toggleSave(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
        setSavedIds((prev) => {
          if (wasSaved) return [id, ...prev];
          return prev.filter((item) => item !== id);
        });
      }
    },
    [client, showAuth, token, useMock]
  );

  const openReactionPicker = useCallback(
    (artwork: Artwork) => {
      if (!useMock && !token) {
        showAuth("login");
        return;
      }
      setReactionTarget(artwork);
    },
    [showAuth, token, useMock]
  );

  const closeReactionPicker = useCallback(() => {
    setReactionTarget(null);
  }, []);

  const submitReaction = useCallback(
    async (emoji: ReactionEmoji) => {
      if (!reactionTarget) return;
      const artworkId = reactionTarget.id;
      setReactionTarget(null);
      setReactedByArtwork((prev) => ({ ...prev, [artworkId]: emoji }));

      if (useMock) return;
      try {
        await client.postReaction(artworkId, emoji);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to react");
        setReactedByArtwork((prev) => {
          const next = { ...prev };
          delete next[artworkId];
          return next;
        });
      }
    },
    [client, reactionTarget, useMock]
  );

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

  const getArtworkForShare = useCallback(
    async (id: string) => {
      const cached = artworkCacheRef.current.get(id);
      if (cached) return cached;
      if (!useMock && !DEFAULT_BASE_URL) {
        return null;
      }
      try {
        const artwork = await client.getArtwork(id);
        cacheArtwork(artwork);
        return artwork;
      } catch {
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
        let mergedItems: FeedItem[] = [];
        setFeedItems((prev) => {
          mergedItems = mode === "refresh" ? response.items : [...prev, ...response.items];
          return mergedItems;
        });
        setNextCursor(response.nextCursor);
        nextCursorRef.current = response.nextCursor;
        response.items.forEach((item) => cacheArtwork(item.artwork));
        if (mergedItems.length) {
          const cachePayload: FeedCachePayload = {
            items: mergedItems,
            nextCursor: response.nextCursor,
            savedAt: Date.now()
          };
          AsyncStorage.setItem(STORAGE_KEYS.feedCache, JSON.stringify(cachePayload)).catch(() => undefined);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load feed");
        if (mode === "refresh" && feedItemsRef.current.length === 0) {
          const cached = await AsyncStorage.getItem(STORAGE_KEYS.feedCache).catch(() => null);
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as Partial<FeedCachePayload>;
              if (Array.isArray(parsed.items)) {
                setFeedItems(parsed.items);
                setNextCursor(parsed.nextCursor);
                nextCursorRef.current = parsed.nextCursor;
                parsed.items.forEach((item) => cacheArtwork(item.artwork));
              }
            } catch {
              // ignore cache parse errors
            }
          }
        }
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
    setNextCursor(undefined);
    nextCursorRef.current = undefined;
    void loadFeed("refresh");
  }, [ready, loadFeed, useMock]);

  const value = useMemo<AppContextValue>(
    () => ({
      baseUrl: DEFAULT_BASE_URL,
      useMock,
      setUseMock,
      token: token || undefined,
      user: user || undefined,
      authModalVisible,
      authMode,
      authBusy,
      authError,
      showAuth,
      hideAuth,
      login,
      register,
      feedItems,
      refreshFeed,
      loadMore,
      refreshSaved,
      isLoading,
      isRefreshing,
      error,
      savedIds,
      isSaved,
      toggleSaved,
      reactedByArtwork,
      openReactionPicker,
      closeReactionPicker,
      submitReaction,
      reactionTarget,
      getArtwork,
      getArtworkForShare,
      cacheArtwork
    }),
    [
      useMock,
      token,
      user,
      authModalVisible,
      authMode,
      authBusy,
      authError,
      showAuth,
      hideAuth,
      login,
      register,
      feedItems,
      refreshFeed,
      loadMore,
      refreshSaved,
      isLoading,
      isRefreshing,
      error,
      savedIds,
      isSaved,
      toggleSaved,
      reactedByArtwork,
      openReactionPicker,
      closeReactionPicker,
      submitReaction,
      reactionTarget,
      getArtwork,
      getArtworkForShare,
      cacheArtwork
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function getFeedMediaSources(artwork: Artwork) {
  const media = Array.isArray(artwork.media) ? artwork.media : [];
  const placeholder = media[0]?.url;
  const main = media[1]?.url ?? media[0]?.url;
  return { placeholder, main };
}

function buildShareLinks(artwork: Artwork) {
  const deepLink = `artclub://artwork/${encodeURIComponent(artwork.id)}`;
  const handle = artwork.handle ? artwork.handle.trim() : "";
  const webUrl = handle ? `${WEB_PRODUCT_BASE_URL}/${encodeURIComponent(handle)}` : undefined;
  return { deepLink, webUrl };
}

function buildShareMessage(artwork: Artwork, deepLink: string, webUrl?: string) {
  const title = artwork.title || "Artwork";
  const byline = artwork.artistName ? ` — ${artwork.artistName}` : "";
  const parts = [`${title}${byline}`, deepLink];
  if (webUrl) parts.push(webUrl);
  return { title, message: parts.join("\n") };
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
    isSaved,
    getArtworkForShare,
    openReactionPicker,
    reactedByArtwork
  } = useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [listHeight, setListHeight] = useState(height);

  const handleShare = useCallback(
    async (artwork: Artwork) => {
      const resolved = await getArtworkForShare(artwork.id);
      const shareTarget = resolved || artwork;
      const { deepLink, webUrl } = buildShareLinks(shareTarget);
      const payload = buildShareMessage(shareTarget, deepLink, webUrl);
      await Share.share({ title: payload.title, message: payload.message, url: deepLink });
    },
    [getArtworkForShare]
  );

  const prefetchAround = useCallback(
    (index: number) => {
      for (let offset = 1; offset <= 5; offset += 1) {
        const artwork = feedItems[index + offset]?.artwork;
        if (!artwork) continue;
        const { main } = getFeedMediaSources(artwork);
        const url = main;
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
      const { main, placeholder } = getFeedMediaSources(artwork);
      const imageUrl = main || "https://picsum.photos/seed/placeholder/1200/1600";
      const saved = isSaved(artwork.id);
      const reactedEmoji = reactedByArtwork[artwork.id];

      return (
        <Pressable
          onPress={() => navigation.navigate("ArtworkDetail", { id: artwork.id })}
          style={[styles.feedItem, { height: listHeight }]}
        >
          <Image
            source={{ uri: imageUrl }}
            placeholder={placeholder ? { uri: placeholder } : undefined}
            style={styles.feedImage}
            contentFit="cover"
            transition={180}
            cachePolicy="disk"
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
                  void toggleSaved(artwork.id);
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
                  openReactionPicker(artwork);
                }}
                style={[styles.actionButton, reactedEmoji && styles.actionButtonActive]}
              >
                <Text style={[styles.actionText, reactedEmoji && styles.actionTextActive]}>
                  {reactedEmoji ? `${reactedEmoji} Reacted` : "React"}
                </Text>
              </Pressable>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation?.();
                  void handleShare(artwork);
                }}
                style={styles.actionButton}
              >
                <Text style={styles.actionText}>Share</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      );
    },
    [
      handleShare,
      insets.bottom,
      insets.top,
      isSaved,
      listHeight,
      navigation,
      openReactionPicker,
      reactedByArtwork,
      toggleSaved
    ]
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
  const { getArtwork, toggleSaved, isSaved, openReactionPicker, reactedByArtwork } = useAppContext();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const handleShare = useCallback(async () => {
    if (!artwork) return;
    const { deepLink, webUrl } = buildShareLinks(artwork);
    const payload = buildShareMessage(artwork, deepLink, webUrl);
    await Share.share({ title: payload.title, message: payload.message, url: deepLink });
  }, [artwork]);

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
  const reactedEmoji = reactedByArtwork[artwork.id];
  const media = artwork.media.length ? [...artwork.media] : [];
  media.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const seen = new Set<string>();
  const galleryMedia = media.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  return (
    <ScrollView
      style={styles.detailContainer}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      {galleryMedia.length > 0 ? (
        <FlatList
          data={galleryMedia}
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
              cachePolicy="disk"
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

        <View style={styles.detailActions}>
          <Pressable
            onPress={() => void toggleSaved(artwork.id)}
            style={[styles.primaryButton, saved && styles.primaryButtonActive]}
          >
            <Text style={[styles.primaryButtonText, saved && styles.primaryButtonTextActive]}>
              {saved ? "Saved" : "Save"}
            </Text>
          </Pressable>
          <Pressable onPress={() => openReactionPicker(artwork)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>
              {reactedEmoji ? `${reactedEmoji} Reacted` : "React"}
            </Text>
          </Pressable>
          <Pressable onPress={handleShare} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Share</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function SavedScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { savedIds, getArtwork, toggleSaved, refreshSaved, token, showAuth, useMock } = useAppContext();
  const [savedArtworks, setSavedArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

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

  if (!useMock && !token && savedIds.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Sign in to save artworks</Text>
        <Text style={styles.emptyText}>Create an account to keep your saved list across devices.</Text>
        <Pressable onPress={() => showAuth("login")} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

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
              cachePolicy="disk"
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
                void toggleSaved(item.id);
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
  const { baseUrl, useMock, setUseMock, user, showAuth } = useAppContext();
  return (
    <View style={styles.profileContainer}>
      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>Account</Text>
        {user ? (
          <Text style={styles.profileValue}>{user.name ? `${user.name} · ${user.email}` : user.email}</Text>
        ) : (
          <>
            <Text style={styles.profileValue}>Not signed in</Text>
            <View style={styles.profileActions}>
              <Pressable onPress={() => showAuth("login")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Login</Text>
              </Pressable>
              <Pressable onPress={() => showAuth("register")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Register</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
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

function AuthModal() {
  const {
    authModalVisible,
    authMode,
    authBusy,
    authError,
    hideAuth,
    login,
    register,
    showAuth
  } = useAppContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (authModalVisible) return;
    setEmail("");
    setPassword("");
    setName("");
  }, [authModalVisible, authMode]);

  const isRegister = authMode === "register";

  const handleSubmit = useCallback(() => {
    if (authBusy) return;
    if (isRegister) {
      void register(email, password, name);
    } else {
      void login(email, password);
    }
  }, [authBusy, email, isRegister, login, name, password, register]);

  return (
    <Modal visible={authModalVisible} animationType="slide" transparent onRequestClose={hideAuth}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalCard}
        >
          <Text style={styles.modalTitle}>{isRegister ? "Create account" : "Welcome back"}</Text>
          <TextInput
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.modalInput}
          />
          {isRegister ? (
            <TextInput
              placeholder="Name (optional)"
              value={name}
              onChangeText={setName}
              style={styles.modalInput}
            />
          ) : null}
          <TextInput
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.modalInput}
          />
          {authError ? <Text style={styles.modalError}>{authError}</Text> : null}
          <Pressable onPress={handleSubmit} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{authBusy ? "Please wait..." : "Continue"}</Text>
          </Pressable>
          <Pressable onPress={hideAuth} style={styles.modalSecondaryButton}>
            <Text style={styles.modalSecondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => showAuth(isRegister ? "login" : "register")}
            style={styles.modalSwitch}
          >
            <Text style={styles.modalSwitchText}>
              {isRegister ? "Have an account? Login" : "New here? Create account"}
            </Text>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const reactionEmojis: ReactionEmoji[] = ["🖤", "🔥", "👀", "😵‍💫"];

function ReactionPicker() {
  const { reactionTarget, closeReactionPicker, submitReaction } = useAppContext();

  if (!reactionTarget) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeReactionPicker}>
      <Pressable style={styles.modalOverlay} onPress={closeReactionPicker}>
        <View style={styles.reactionPickerCard}>
          <Text style={styles.reactionPickerTitle}>React to {reactionTarget.title}</Text>
          <View style={styles.reactionRow}>
            {reactionEmojis.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={(event) => {
                  event.stopPropagation?.();
                  void submitReaction(emoji);
                }}
                style={styles.reactionEmojiButton}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
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
        <NavigationContainer theme={NAV_THEME} linking={linking}>
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
        <AuthModal />
        <ReactionPicker />
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
  detailActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
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
  secondaryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  secondaryButtonText: {
    color: "#111111",
    fontWeight: "600"
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
  profileActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12
  },
  profileHint: {
    color: "#6B6B6B",
    fontSize: 13,
    lineHeight: 18
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    gap: 12
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111111"
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111111",
    backgroundColor: "#F9F7F4"
  },
  modalError: {
    color: "#B42318",
    fontSize: 13
  },
  modalSecondaryButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 6
  },
  modalSecondaryText: {
    color: "#6B6B6B",
    fontSize: 14
  },
  modalSwitch: {
    alignSelf: "flex-start",
    marginTop: 4
  },
  modalSwitchText: {
    color: "#1C1C1C",
    fontWeight: "600"
  },
  reactionPickerCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    gap: 16
  },
  reactionPickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111111",
    textAlign: "center"
  },
  reactionRow: {
    flexDirection: "row",
    justifyContent: "space-around"
  },
  reactionEmojiButton: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: "#F4F1ED"
  },
  reactionEmoji: {
    fontSize: 24
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
