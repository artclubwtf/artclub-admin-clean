import "react-native-gesture-handler";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  GestureResponderEvent,
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
import { Animated } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
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
import { Swipeable } from "react-native-gesture-handler";
import { createMobileApiClient } from "@artclub/api-client";
import type { Artwork, FeedItem } from "@artclub/models";
import appConfig from "./app.json";
import ViewShot from "react-native-view-shot";

type RootStackParamList = {
  Tabs: undefined;
  ArtworkDetail: { id: string };
  Artist: { id: string; name?: string };
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

type PollCard = {
  id: string;
  question: string;
  options: string[];
};

type FeedListItem =
  | { type: "artwork"; artwork: Artwork; feedItem: FeedItem }
  | { type: "poll"; poll: PollCard };

type MobileUser = {
  id: string;
  email: string;
  name?: string;
};

type AuthMode = "login" | "register";
type ReactionEmoji = "🖤" | "🔥" | "👀" | "😵‍💫";
type AnalyticsEvent = {
  id: string;
  name: "view" | "save" | "react" | "share" | "open_detail";
  payload?: Record<string, unknown>;
  ts: number;
};

const reactionEmojis: ReactionEmoji[] = ["🖤", "🔥", "👀", "😵‍💫"];
const reactionEmojiSet = new Set<ReactionEmoji>(reactionEmojis);

type AppContextValue = {
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  useMock: boolean;
  setUseMock: (value: boolean) => void;
  devUnlocked: boolean;
  setDevUnlocked: (value: boolean) => void;
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
  reactionByArtworkId: Record<string, ReactionEmoji>;
  openReactionPicker: (artwork: Artwork, anchor?: { x: number; y: number }) => void;
  closeReactionPicker: () => void;
  submitReaction: (emoji: ReactionEmoji) => Promise<void>;
  reactToArtwork: (artwork: Artwork, emoji: ReactionEmoji) => Promise<void>;
  reactionTarget?: Artwork | null;
  reactionAnchor?: { x: number; y: number } | null;
  showToast: (text: string) => void;
  clearSavedCache: () => void;
  clearFeedCache: () => void;
  clearReactionCache: () => void;
  clearAllCache: () => void;
  getArtwork: (id: string) => Promise<Artwork | null>;
  getArtworkForShare: (id: string) => Promise<Artwork | null>;
  cacheArtwork: (artwork: Artwork) => void;
  trackEvent: (name: AnalyticsEvent["name"], payload?: Record<string, unknown>) => void;
  hydrateReactions: (ids: string[]) => Promise<void>;
};

const STORAGE_KEYS = {
  saved: "artclub:saved-artworks",
  useMock: "artclub:use-mock",
  feedCache: "artclub:feed-cache:v1",
  reactions: "ac.reactions.v1",
  baseUrl: "artclub:api-base-url",
  devUnlocked: "artclub:dev-unlocked",
  token: "artclub:auth-token",
  user: "artclub:auth-user",
  pollAnswers: "ac.polls.v1",
  eventsQueue: "ac.events.v1"
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
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
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
  const [reactionAnchor, setReactionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [reactionByArtworkId, setReactionByArtworkId] = useState<Record<string, ReactionEmoji>>({});
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const eventsQueueRef = useRef<AnalyticsEvent[]>([]);
  const flushingRef = useRef(false);

  const artworkCacheRef = useRef<Map<string, Artwork>>(new Map());
  const feedItemsRef = useRef<FeedItem[]>([]);
  const savedIdsRef = useRef<string[]>([]);
  const nextCursorRef = useRef<string | undefined>(undefined);
  const loadingRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionsSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const client = useMemo(
    () =>
      createMobileApiClient({
        baseUrl,
        useMock,
        token: token || undefined
      }),
    [baseUrl, useMock, token]
  );

  const cacheArtwork = useCallback((artwork: Artwork) => {
    artworkCacheRef.current.set(artwork.id, artwork);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast({ text });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 900);
  }, []);

  const clearSavedCache = useCallback(() => {
    setSavedIds([]);
    savedIdsRef.current = [];
    AsyncStorage.removeItem(STORAGE_KEYS.saved).catch(() => undefined);
  }, []);

  const clearFeedCache = useCallback(() => {
    setFeedItems([]);
    setNextCursor(undefined);
    nextCursorRef.current = undefined;
    artworkCacheRef.current.clear();
    AsyncStorage.removeItem(STORAGE_KEYS.feedCache).catch(() => undefined);
  }, []);

  const clearReactionCache = useCallback(() => {
    setReactionByArtworkId({});
    AsyncStorage.removeItem(STORAGE_KEYS.reactions).catch(() => undefined);
  }, []);

  const persistReactions = useCallback((next: Record<string, ReactionEmoji>) => {
    if (reactionsSaveTimeoutRef.current) clearTimeout(reactionsSaveTimeoutRef.current);
    reactionsSaveTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEYS.reactions, JSON.stringify(next)).catch(() => undefined);
      reactionsSaveTimeoutRef.current = null;
    }, 300);
  }, []);

  const hydrateReactions = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      if (!token || useMock || !baseUrl) return;
      try {
        const response = await client.getMyReactions(ids);
        if (!response?.reactions) return;
        setReactionByArtworkId((prev) => {
          const next: Record<string, ReactionEmoji> = { ...prev };
          Object.entries(response.reactions).forEach(([key, value]) => {
            if (reactionEmojiSet.has(value)) {
              next[key] = value as ReactionEmoji;
            }
          });
          persistReactions(next);
          return next;
        });
      } catch {
        // ignore hydration errors
      }
    },
    [baseUrl, client, persistReactions, token, useMock]
  );

  const clearAllCache = useCallback(() => {
    clearSavedCache();
    clearFeedCache();
    clearReactionCache();
  }, [clearFeedCache, clearReactionCache, clearSavedCache]);

  const persistEventsQueue = useCallback((queue: AnalyticsEvent[]) => {
    AsyncStorage.setItem(STORAGE_KEYS.eventsQueue, JSON.stringify(queue)).catch(() => undefined);
  }, []);

  const trackEvent = useCallback(
    (name: AnalyticsEvent["name"], payload?: Record<string, unknown>) => {
      const event: AnalyticsEvent = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        payload,
        ts: Date.now()
      };
      const next = [...eventsQueueRef.current, event];
      const trimmed = next.length > 200 ? next.slice(next.length - 200) : next;
      eventsQueueRef.current = trimmed;
      persistEventsQueue(trimmed);
    },
    [persistEventsQueue]
  );

  const flushEvents = useCallback(async () => {
    if (flushingRef.current) return;
    if (!baseUrl) return;
    const queue = eventsQueueRef.current;
    if (queue.length === 0) return;
    flushingRef.current = true;
    try {
      const batch = queue.slice(0, 50).map((event) => ({
        eventName: event.name,
        productGid: typeof event.payload?.id === "string" ? (event.payload.id as string) : undefined,
        metadata: event.payload ?? undefined,
        ts: event.ts
      }));
      const response = await client.postEvents(batch);
      if (response?.ok) {
        const remaining = queue.slice(batch.length);
        eventsQueueRef.current = remaining;
        persistEventsQueue(remaining);
      }
    } catch {
      // keep queue
    } finally {
      flushingRef.current = false;
    }
  }, [baseUrl, client, persistEventsQueue]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadStored() {
      try {
        const [
          storedSaved,
          storedMock,
          storedFeed,
          storedToken,
          storedUser,
          storedReactions,
          storedBaseUrl,
          storedDev,
          storedEvents
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.saved),
          AsyncStorage.getItem(STORAGE_KEYS.useMock),
          AsyncStorage.getItem(STORAGE_KEYS.feedCache),
          AsyncStorage.getItem(STORAGE_KEYS.token),
          AsyncStorage.getItem(STORAGE_KEYS.user),
          AsyncStorage.getItem(STORAGE_KEYS.reactions),
          AsyncStorage.getItem(STORAGE_KEYS.baseUrl),
          AsyncStorage.getItem(STORAGE_KEYS.devUnlocked),
          AsyncStorage.getItem(STORAGE_KEYS.eventsQueue)
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

        if (storedBaseUrl !== null) {
          setBaseUrl(storedBaseUrl);
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

        if (storedReactions) {
          try {
            const parsed = JSON.parse(storedReactions) as Record<string, unknown>;
            if (parsed && typeof parsed === "object") {
              const next: Record<string, ReactionEmoji> = {};
              Object.entries(parsed).forEach(([key, value]) => {
                if (typeof value === "string" && reactionEmojiSet.has(value as ReactionEmoji)) {
                  next[key] = value as ReactionEmoji;
                }
              });
              setReactionByArtworkId(next);
            }
          } catch {
            // ignore parse errors
          }
        }

        if (storedDev) {
          setDevUnlocked(storedDev === "true");
        }
        if (storedEvents) {
          try {
            const parsed = JSON.parse(storedEvents) as AnalyticsEvent[];
            if (Array.isArray(parsed)) {
              eventsQueueRef.current = parsed;
            }
          } catch {
            // ignore parse errors
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
    AsyncStorage.setItem(STORAGE_KEYS.baseUrl, baseUrl).catch(() => undefined);
  }, [baseUrl, ready]);

  useEffect(() => {
    if (!ready) return;
    persistReactions(reactionByArtworkId);
    return () => {
      if (reactionsSaveTimeoutRef.current) clearTimeout(reactionsSaveTimeoutRef.current);
    };
  }, [persistReactions, reactionByArtworkId, ready]);

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

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEYS.devUnlocked, devUnlocked ? "true" : "false").catch(() => undefined);
  }, [devUnlocked, ready]);

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
      const serverIds = Array.isArray(response.productGids) ? response.productGids : [];
      const localIds = savedIdsRef.current;
      const serverSet = new Set(serverIds);
      const toSync = localIds.filter((id) => !serverSet.has(id));
      if (toSync.length) {
        await Promise.allSettled(toSync.map((id) => client.toggleSave(id, true)));
        const refreshed = await client.listSaves();
        const refreshedIds = Array.isArray(refreshed.productGids) ? refreshed.productGids : serverIds;
        setSavedIds(refreshedIds.length ? refreshedIds : localIds);
        return;
      }
      if (serverIds.length || localIds.length === 0) {
        setSavedIds(serverIds);
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
      trackEvent("save", { id, saved: !wasSaved });
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
    [client, showAuth, token, trackEvent, useMock]
  );

  const openReactionPicker = useCallback(
    (artwork: Artwork, anchor?: { x: number; y: number }) => {
      if (!useMock && !token) {
        showAuth("login");
        return;
      }
      setReactionTarget(artwork);
      setReactionAnchor(anchor ?? null);
    },
    [showAuth, token, useMock]
  );

  const closeReactionPicker = useCallback(() => {
    setReactionTarget(null);
    setReactionAnchor(null);
  }, []);

  const reactToArtwork = useCallback(
    async (artwork: Artwork, emoji: ReactionEmoji) => {
      let previous: ReactionEmoji | undefined;
      setReactionByArtworkId((prev) => {
        previous = prev[artwork.id];
        return { ...prev, [artwork.id]: emoji };
      });
      trackEvent("react", { id: artwork.id, emoji });

      try {
        await Haptics.selectionAsync();
      } catch {
        // ignore haptics failures
      }
      showToast(`Reacted ${emoji}`);

      if (useMock) return;
      try {
        await client.postReaction(artwork.id, emoji);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to react");
        setReactionByArtworkId((prev) => {
          const next = { ...prev };
          if (previous) next[artwork.id] = previous;
          else delete next[artwork.id];
          return next;
        });
      }
    },
    [client, showToast, trackEvent, useMock]
  );

  const submitReaction = useCallback(
    async (emoji: ReactionEmoji) => {
      if (!reactionTarget) return;
      const target = reactionTarget;
      setReactionTarget(null);
      setReactionAnchor(null);
      await reactToArtwork(target, emoji);
    },
    [reactToArtwork, reactionTarget]
  );

  const getArtwork = useCallback(
    async (id: string) => {
      const cached = artworkCacheRef.current.get(id);
      if (cached) return cached;
      if (!useMock && !baseUrl) {
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
    [baseUrl, cacheArtwork, client, useMock]
  );

  const getArtworkForShare = useCallback(
    async (id: string) => {
      const cached = artworkCacheRef.current.get(id);
      if (cached) return cached;
      if (!useMock && !baseUrl) {
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
    [baseUrl, cacheArtwork, client, useMock]
  );

  const loadFeed = useCallback(
    async (mode: "refresh" | "more") => {
      if (!useMock && !baseUrl) {
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
        const ids = response.items.map((item) => item.artwork.id).filter(Boolean);
        if (ids.length) {
          void hydrateReactions(ids);
        }
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
    [baseUrl, cacheArtwork, client, hydrateReactions, useMock]
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

  useEffect(() => {
    if (!ready) return;
    void flushEvents();
    const interval = setInterval(() => {
      void flushEvents();
    }, 30000);
    return () => clearInterval(interval);
  }, [flushEvents, ready]);

  const value = useMemo<AppContextValue>(
    () => ({
      baseUrl,
      setBaseUrl,
      useMock,
      setUseMock,
      devUnlocked,
      setDevUnlocked,
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
      reactionByArtworkId,
      openReactionPicker,
      closeReactionPicker,
      submitReaction,
      reactToArtwork,
      reactionTarget,
      reactionAnchor,
      showToast,
      clearSavedCache,
      clearFeedCache,
      clearReactionCache,
      clearAllCache,
      getArtwork,
      getArtworkForShare,
      cacheArtwork,
      trackEvent,
      hydrateReactions
    }),
    [
      baseUrl,
      setBaseUrl,
      useMock,
      token,
      user,
      devUnlocked,
      setDevUnlocked,
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
      reactionByArtworkId,
      openReactionPicker,
      closeReactionPicker,
      submitReaction,
      reactToArtwork,
      reactionTarget,
      reactionAnchor,
      showToast,
      clearSavedCache,
      clearFeedCache,
      clearReactionCache,
      clearAllCache,
      getArtwork,
      getArtworkForShare,
      cacheArtwork,
      trackEvent,
      hydrateReactions
    ]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      {toast ? <ToastOverlay text={toast.text} /> : null}
    </AppContext.Provider>
  );
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

function normalizeArtistId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

type ShareCardPayload = {
  artwork: Artwork;
  deepLink: string;
  webUrl?: string;
};

function ShareCard({ payload }: { payload: ShareCardPayload }) {
  const imageUrl = payload.artwork.media?.[0]?.url ?? "https://picsum.photos/seed/share/1200/1600";
  return (
    <View style={styles.shareCard}>
      <Image source={{ uri: imageUrl }} style={styles.shareCardImage} contentFit="cover" />
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]}
        style={styles.shareCardGradient}
      />
      <View style={styles.shareCardContent}>
        <Text style={styles.shareCardBrand}>ARTCLUB</Text>
        <Text style={styles.shareCardTitle}>{payload.artwork.title}</Text>
        {payload.artwork.artistName ? (
          <Text style={styles.shareCardArtist}>{payload.artwork.artistName}</Text>
        ) : null}
        <View style={styles.shareCardLinks}>
          <Text style={styles.shareCardLink}>{payload.deepLink}</Text>
          {payload.webUrl ? <Text style={styles.shareCardLink}>{payload.webUrl}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function useShareCard() {
  const viewShotRef = useRef<ViewShot>(null);
  const [payload, setPayload] = useState<ShareCardPayload | null>(null);

  const shareWithCard = useCallback(
    async (nextPayload: ShareCardPayload) => {
      const message = buildShareMessage(
        nextPayload.artwork,
        nextPayload.deepLink,
        nextPayload.webUrl
      );
      setPayload(nextPayload);
      await new Promise((resolve) => setTimeout(resolve, 60));

      try {
        const uri = await viewShotRef.current?.capture?.();
        if (!uri) throw new Error("capture failed");
        const target = `${FileSystem.cacheDirectory ?? ""}artclub-share-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: target });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(target, {
            dialogTitle: message.title,
            mimeType: "image/jpeg",
            UTI: "public.jpeg"
          });
          return;
        }
      } catch (error) {
        // Fallback handled below.
      }

      await Share.share({
        title: message.title,
        message: message.message,
        url: nextPayload.deepLink
      });
    },
    []
  );

  const shareCardElement = payload ? (
    <View style={styles.shareCardHost} pointerEvents="none">
      <ViewShot ref={viewShotRef} options={{ format: "jpg", quality: 0.92 }}>
        <ShareCard payload={payload} />
      </ViewShot>
    </View>
  ) : null;

  return { shareCardElement, shareWithCard };
}

const pollTemplates = [
  { question: "Pick one for heartbreak", options: ["Left", "Right"] },
  { question: "Mood?", options: ["Calm", "Chaos"] },
  { question: "Would you hang it?", options: ["Yes", "No"] }
];

function createPollCard(index: number, seed: number): PollCard {
  const template = pollTemplates[index % pollTemplates.length];
  return {
    id: `poll-${seed}-${index}`,
    question: template.question,
    options: template.options
  };
}

function getPollSpacing(seed: number, offset: number) {
  return 8 + ((seed + offset) % 5);
}

function buildMixedFeedItems(items: FeedItem[]) {
  if (items.length === 0) return [];
  const seedBase = items[0]?.artwork?.id ?? "poll";
  const seed = seedBase.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  let nextPollAt = getPollSpacing(seed, 0);
  let pollCount = 0;
  const mixed: FeedListItem[] = [];

  items.forEach((feedItem, index) => {
    mixed.push({ type: "artwork", artwork: feedItem.artwork, feedItem });
    const position = index + 1;
    if (position === nextPollAt) {
      mixed.push({ type: "poll", poll: createPollCard(pollCount, seed) });
      pollCount += 1;
      nextPollAt = position + getPollSpacing(seed, pollCount);
    }
  });

  return mixed;
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
    reactToArtwork,
    reactionByArtworkId,
    token,
    useMock,
    showToast,
    trackEvent,
    hydrateReactions
  } = useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [listHeight, setListHeight] = useState(height);
  const [uiHiddenById, setUiHiddenById] = useState<Record<string, boolean>>({});
  const [pollAnswers, setPollAnswers] = useState<Record<string, string>>({});
  const { shareCardElement, shareWithCard } = useShareCard();
  const lastTapRef = useRef<{ id: string; ts: number } | null>(null);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActiveRef = useRef(false);
  const pollSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentViewIdRef = useRef<string | null>(null);
  const mixedFeedItems = useMemo(() => buildMixedFeedItems(feedItems), [feedItems]);

  const handleShare = useCallback(
    async (artwork: Artwork) => {
      const resolved = await getArtworkForShare(artwork.id);
      const shareTarget = resolved || artwork;
      const { deepLink, webUrl } = buildShareLinks(shareTarget);
      trackEvent("share", { id: shareTarget.id });
      await shareWithCard({ artwork: shareTarget, deepLink, webUrl });
    },
    [getArtworkForShare, shareWithCard, trackEvent]
  );

  const toggleUiVisibility = useCallback((id: string) => {
    setUiHiddenById((prev) => {
      const currentHidden = prev[id] ?? false;
      return { ...prev, [id]: !currentHidden };
    });
  }, []);

  const handleTap = useCallback(
    (artwork: Artwork) => {
      if (longPressActiveRef.current) {
        longPressActiveRef.current = false;
        return;
      }
      const now = Date.now();
      const last = lastTapRef.current;
      if (last && last.id === artwork.id && now - last.ts < 280) {
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current);
          tapTimeoutRef.current = null;
        }
        lastTapRef.current = null;
        const wasSaved = isSaved(artwork.id);
        const canSave = useMock || Boolean(token);
        void toggleSaved(artwork.id);
        if (canSave) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          showToast(wasSaved ? "Removed" : "Saved");
        }
        return;
      }

      lastTapRef.current = { id: artwork.id, ts: now };
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = setTimeout(() => {
        toggleUiVisibility(artwork.id);
        tapTimeoutRef.current = null;
        lastTapRef.current = null;
      }, 280);
    },
    [isSaved, showToast, toggleSaved, toggleUiVisibility, token, useMock]
  );

  const handleLongPress = useCallback(
    (artwork: Artwork, event: GestureResponderEvent) => {
      longPressActiveRef.current = true;
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = null;
      openReactionPicker(artwork, {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY
      });
    },
    [openReactionPicker]
  );

  const handleReactButtonPress = useCallback(
    (artwork: Artwork) => {
      const emoji = reactionByArtworkId[artwork.id];
      if (emoji && (useMock || token)) {
        void reactToArtwork(artwork, emoji);
        return;
      }
      openReactionPicker(artwork);
    },
    [openReactionPicker, reactToArtwork, reactionByArtworkId, token, useMock]
  );

  const handleArtistPress = useCallback(
    (artistName: string) => {
      const id = normalizeArtistId(artistName);
      navigation.navigate("Artist", { id, name: artistName });
    },
    [navigation]
  );

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.pollAnswers)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as Record<string, string>;
        if (parsed && typeof parsed === "object") setPollAnswers(parsed);
      })
      .catch(() => undefined);

    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      if (pollSaveTimeoutRef.current) clearTimeout(pollSaveTimeoutRef.current);
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    };
  }, []);

  const persistPollAnswers = useCallback((next: Record<string, string>) => {
    if (pollSaveTimeoutRef.current) clearTimeout(pollSaveTimeoutRef.current);
    pollSaveTimeoutRef.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEYS.pollAnswers, JSON.stringify(next)).catch(() => undefined);
    }, 250);
  }, []);

  const answerPoll = useCallback(
    (pollId: string, option: string) => {
      setPollAnswers((prev) => {
        const next = { ...prev, [pollId]: option };
        persistPollAnswers(next);
        return next;
      });
    },
    [persistPollAnswers]
  );

  const prefetchAround = useCallback(
    (index: number) => {
      let count = 0;
      for (let cursor = index + 1; cursor < mixedFeedItems.length; cursor += 1) {
        if (count >= 5) break;
        const entry = mixedFeedItems[cursor];
        if (entry?.type !== "artwork") continue;
        const { main } = getFeedMediaSources(entry.artwork);
        if (main) {
          void Image.prefetch(main);
        }
        count += 1;
      }
    },
    [mixedFeedItems]
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const firstIndex = viewableItems[0]?.index ?? 0;
      if (firstIndex !== null) prefetchAround(firstIndex);
      const firstArtworkIndex = viewableItems.find((entry) => {
        const idx = entry.index ?? -1;
        const item = idx >= 0 ? mixedFeedItems[idx] : null;
        return item?.type === "artwork";
      })?.index;
      const artworkItem =
        typeof firstArtworkIndex === "number" ? mixedFeedItems[firstArtworkIndex] : null;
      const artworkId = artworkItem?.type === "artwork" ? artworkItem.artwork.id : null;
      if (artworkId === currentViewIdRef.current) return;
      currentViewIdRef.current = artworkId;
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      if (!artworkId) return;
      viewTimerRef.current = setTimeout(() => {
        trackEvent("view", { id: artworkId });
      }, 1000);
    },
    [mixedFeedItems, prefetchAround, trackEvent]
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedListItem }) => {
      if (item.type === "poll") {
        const answer = pollAnswers[item.poll.id];
        return (
          <View style={[styles.pollCard, { minHeight: listHeight * 0.55 }]}>
            <Text style={styles.pollTitle}>{item.poll.question}</Text>
            <View style={styles.pollOptions}>
              {item.poll.options.map((option) => {
                const selected = answer === option;
                return (
                  <Pressable
                    key={`${item.poll.id}-${option}`}
                    onPress={() => answerPoll(item.poll.id, option)}
                    style={[styles.pollOption, selected && styles.pollOptionSelected]}
                  >
                    <Text style={[styles.pollOptionText, selected && styles.pollOptionTextSelected]}>
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {answer ? (
              <Text style={styles.pollAnswerText}>You chose {answer}</Text>
            ) : (
              <Text style={styles.pollHintText}>Tap once to answer.</Text>
            )}
          </View>
        );
      }

      const artwork = item.artwork;
      const { main, placeholder } = getFeedMediaSources(artwork);
      const imageUrl = main || "https://picsum.photos/seed/placeholder/1200/1600";
      const saved = isSaved(artwork.id);
      const reactedEmoji = reactionByArtworkId[artwork.id];
      const uiVisible = !(uiHiddenById[artwork.id] ?? false);

      return (
        <Pressable
          onPress={() => handleTap(artwork)}
          onLongPress={(event) => handleLongPress(artwork, event)}
          delayLongPress={320}
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
          {uiVisible ? (
            <>
              <View style={styles.feedOverlay} />
              <LinearGradient
                colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
                style={styles.feedTopGradient}
                pointerEvents="none"
              />
              <View
                style={[
                  styles.feedContent,
                  { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 36 }
                ]}
              >
                <BlurView intensity={16} tint="dark" style={styles.feedTitleBlur}>
                  <View style={styles.feedTitleInner}>
                    <Text style={styles.feedTitle}>{artwork.title}</Text>
                    {artwork.artistName ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation?.();
                          handleArtistPress(artwork.artistName || "");
                        }}
                      >
                        <Text style={styles.feedArtist}>{artwork.artistName}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </BlurView>
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
                      handleReactButtonPress(artwork);
                    }}
                    style={[styles.actionButton, reactedEmoji && styles.actionButtonActive]}
                  >
                    <Text style={[styles.actionText, reactedEmoji && styles.actionTextActive]}>
                      {reactedEmoji ? reactedEmoji : "React"}
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
            </>
          ) : null}
        </Pressable>
      );
    },
    [
      answerPoll,
      handleShare,
      handleReactButtonPress,
      handleLongPress,
      handleTap,
      insets.bottom,
      insets.top,
      isSaved,
      listHeight,
      pollAnswers,
      reactionByArtworkId,
      toggleSaved,
      uiHiddenById
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
        data={mixedFeedItems}
        keyExtractor={(item, index) =>
          item.type === "poll" ? `${item.poll.id}-${index}` : item.artwork.id
        }
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
      {shareCardElement}
    </View>
  );
}

function ArtworkDetailScreen({
  route
}: {
  route: { params: { id: string } };
}) {
  const { id } = route.params;
  const {
    getArtwork,
    toggleSaved,
    isSaved,
    openReactionPicker,
    reactToArtwork,
    reactionByArtworkId,
    token,
    useMock,
    trackEvent,
    hydrateReactions
  } = useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const heroHeight = Math.min(width * 1.2, 520);
  const heroOpacity = useRef(new Animated.Value(1)).current;
  const { shareCardElement, shareWithCard } = useShareCard();
  const [detailViewIndex, setDetailViewIndex] = useState(0);
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const openDetailTrackedRef = useRef(false);
  const handleShare = useCallback(async () => {
    if (!artwork) return;
    const { deepLink, webUrl } = buildShareLinks(artwork);
    trackEvent("share", { id: artwork.id });
    await shareWithCard({ artwork, deepLink, webUrl });
  }, [artwork, shareWithCard, trackEvent]);

  const handleArtistPress = useCallback(() => {
    if (!artwork?.artistName) return;
    const id = normalizeArtistId(artwork.artistName);
    navigation.navigate("Artist", { id, name: artwork.artistName });
  }, [artwork?.artistName, navigation]);

  useEffect(() => {
    openDetailTrackedRef.current = false;
  }, [id]);

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
      if (result) {
        void hydrateReactions([result.id]);
      }
    }

    loadArtwork();
    return () => {
      active = false;
    };
  }, [getArtwork, id]);

  useEffect(() => {
    if (!artwork) return;
    if (openDetailTrackedRef.current) return;
    trackEvent("open_detail", { id: artwork.id });
    openDetailTrackedRef.current = true;
  }, [artwork, trackEvent]);

  const media = artwork?.media?.length ? [...artwork.media] : [];
  media.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const seen = new Set<string>();
  const galleryMedia = media.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  const showHeroOverlay = galleryMedia.length > 0;
  const heroImageUrl = galleryMedia[0]?.url ?? "https://picsum.photos/seed/detail/900/1200";
  const cropTransforms = useMemo(() => {
    const shiftX = width * 0.12;
    const shiftY = heroHeight * 0.1;
    return [
      { scale: 1, translateX: 0, translateY: 0 },
      { scale: 1.35, translateX: -shiftX, translateY: -shiftY },
      { scale: 1.45, translateX: shiftX * 0.6, translateY: shiftY * 0.8 }
    ];
  }, [heroHeight, width]);

  useEffect(() => {
    heroOpacity.setValue(0);
    Animated.timing(heroOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true
    }).start();
  }, [detailViewIndex, heroOpacity]);

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
  const reactedEmoji = reactionByArtworkId[artwork.id];
  const handleReactPress = () => {
    if (reactedEmoji && (useMock || token)) {
      void reactToArtwork(artwork, reactedEmoji);
      return;
    }
    openReactionPicker(artwork);
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.detailContainer}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {showHeroOverlay ? (
          <View style={[styles.detailHero, { height: heroHeight }]}>
            <Pressable
              onPress={() => setDetailViewIndex((prev) => (prev + 1) % 3)}
              style={styles.detailHeroPressable}
            >
              <Animated.View style={{ opacity: heroOpacity }}>
                <Image
                  source={{ uri: heroImageUrl }}
                  style={[
                    { width, height: heroHeight },
                    styles.detailHeroImage,
                    {
                      transform: [
                        { scale: cropTransforms[detailViewIndex].scale },
                        { translateX: cropTransforms[detailViewIndex].translateX },
                        { translateY: cropTransforms[detailViewIndex].translateY }
                      ]
                    }
                  ]}
                  contentFit="cover"
                  transition={180}
                  cachePolicy="disk"
                />
              </Animated.View>
              <View style={styles.detailDots}>
                {[0, 1, 2].map((idx) => (
                  <View
                    key={`dot-${idx}`}
                    style={[
                      styles.detailDot,
                      idx === detailViewIndex ? styles.detailDotActive : null
                    ]}
                  />
                ))}
              </View>
            </Pressable>
            <LinearGradient
              colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
              style={styles.detailTopGradient}
              pointerEvents="none"
            />
          </View>
        ) : null}

        <View style={styles.detailContent}>
          <Text style={styles.detailTitle}>{artwork.title}</Text>
          {artwork.artistName ? (
            <Pressable onPress={handleArtistPress}>
              <Text style={styles.detailArtist}>{artwork.artistName}</Text>
            </Pressable>
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
            <Pressable onPress={handleReactPress} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{reactedEmoji ? reactedEmoji : "React"}</Text>
            </Pressable>
            <Pressable onPress={handleShare} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Share</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      {shareCardElement}
    </View>
  );
}

function ArtistScreen({
  route
}: {
  route: { params: { id: string; name?: string } };
}) {
  const { feedItems, baseUrl, useMock } = useAppContext();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { id, name: fallbackName } = route.params;
  const [profile, setProfile] = useState<{ id: string; name: string; avatarUrl?: string | null; bio?: string | null; instagramUrl?: string | null } | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [offlineFallback, setOfflineFallback] = useState(false);
  const columns = width >= 720 ? 3 : 2;
  const tileGap = 12;
  const tileSize = (width - 20 * 2 - tileGap * (columns - 1)) / columns;

  const localFallback = useMemo(
    () =>
      feedItems
        .map((item) => item.artwork)
        .filter((artwork) => (artwork.artistName || "").trim() === (fallbackName || "").trim()),
    [feedItems, fallbackName]
  );

  const loadArtist = useCallback(
    async (mode: "refresh" | "more") => {
      if (!baseUrl || useMock) {
        setOfflineFallback(true);
        setArtworks(localFallback);
        return;
      }
      if (mode === "more" && (!hasMore || loading)) return;
      setLoading(true);
      try {
        const client = createMobileApiClient({ baseUrl, useMock: false });
        if (mode === "refresh") {
          const response = await client.getArtist(id);
          setProfile(response.artist);
          setCursor(undefined);
        }
        const response = await client.getArtistArtworks(id, mode === "more" ? cursor : undefined, 30);
        const nextArtworks = response.items.map((item) => item.artwork);
        setArtworks((prev) => (mode === "refresh" ? nextArtworks : [...prev, ...nextArtworks]));
        setCursor(response.nextCursor);
        setHasMore(Boolean(response.nextCursor));
        setOfflineFallback(false);
      } catch {
        setOfflineFallback(true);
        setArtworks(localFallback);
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, cursor, hasMore, id, loading, localFallback, useMock]
  );

  useEffect(() => {
    setCursor(undefined);
    setHasMore(true);
    void loadArtist("refresh");
  }, [id, loadArtist]);

  const displayName = profile?.name || fallbackName || "Artist";

  return (
    <View style={styles.artistContainer}>
      <View style={[styles.artistHeader, { paddingTop: insets.top + 16 }]}>
        {profile?.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.artistAvatarImage} contentFit="cover" />
        ) : (
          <View style={styles.artistAvatar} />
        )}
        <Text style={styles.artistName}>{displayName}</Text>
        <Text style={styles.artistBio}>{profile?.bio || "Bio coming soon."}</Text>
      </View>
      <FlatList
        data={artworks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.artistGrid, { paddingBottom: insets.bottom + 32 }]}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: tileGap, marginBottom: tileGap } : undefined}
        onEndReached={() => void loadArtist("more")}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          offlineFallback ? (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>Offline mode: showing cached works</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("ArtworkDetail", { id: item.id })}
            style={[styles.artistTile, { width: tileSize, height: tileSize * 1.25 }]}
          >
            <Image
              source={{ uri: item.media[0]?.url ?? "https://picsum.photos/seed/artist/600/600" }}
              style={styles.artistTileImage}
              contentFit="cover"
              transition={160}
              cachePolicy="disk"
            />
            <View style={styles.artistTileOverlay} />
            <View style={styles.artistTileText}>
              <Text numberOfLines={2} style={styles.artistTileTitle}>
                {item.title}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function SavedScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {
    savedIds,
    getArtwork,
    toggleSaved,
    refreshSaved,
    token,
    showAuth,
    useMock,
    baseUrl
  } = useAppContext();
  const [savedArtworks, setSavedArtworks] = useState<Artwork[]>([]);
  const [serverArtworks, setServerArtworks] = useState<Artwork[]>([]);
  const [serverCursor, setServerCursor] = useState<string | undefined>(undefined);
  const [hasMoreServer, setHasMoreServer] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingServer, setLoadingServer] = useState(false);
  const [offlineFallback, setOfflineFallback] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const serverCursorRef = useRef<string | undefined>(undefined);
  const hasMoreServerRef = useRef(true);
  const loadingServerRef = useRef(false);
  const offlineFallbackRef = useRef(false);
  const syncingLocalRef = useRef(false);
  const { width } = useWindowDimensions();
  const columns = width >= 720 ? 3 : 2;
  const tileGap = 12;
  const tileSize = (width - 20 * 2 - tileGap * (columns - 1)) / columns;

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const canUseServer = Boolean(baseUrl) && Boolean(token) && !useMock;

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

  const loadServerSaves = useCallback(
    async (mode: "refresh" | "more") => {
      if (!canUseServer) return;
      if (mode === "more" && (!hasMoreServerRef.current || loadingServerRef.current || offlineFallbackRef.current)) {
        return;
      }
      if (loadingServerRef.current) return;
      setLoadingServer(true);
      try {
        const cursor = mode === "refresh" ? undefined : serverCursorRef.current;
        const response = await createMobileApiClient({
          baseUrl,
          useMock: false,
          token: token || undefined
        }).getSaves(cursor, 30);
        const nextItems = response.items.map((item) => item.artwork);
        setServerArtworks((prev) => (mode === "refresh" ? nextItems : [...prev, ...nextItems]));
        setServerCursor(response.nextCursor);
        setHasMoreServer(Boolean(response.nextCursor));
        setOfflineFallback(false);
      } catch {
        setOfflineFallback(true);
      } finally {
        setLoadingServer(false);
      }
    },
    [baseUrl, canUseServer, token]
  );

  const refreshServer = useCallback(async () => {
    if (!canUseServer) return;
    setServerCursor(undefined);
    setHasMoreServer(true);
    await loadServerSaves("refresh");
  }, [canUseServer, loadServerSaves]);

  useEffect(() => {
    if (!canUseServer) return;
    void refreshServer();
  }, [canUseServer, refreshServer]);

  useEffect(() => {
    serverCursorRef.current = serverCursor;
  }, [serverCursor]);

  useEffect(() => {
    hasMoreServerRef.current = hasMoreServer;
  }, [hasMoreServer]);

  useEffect(() => {
    loadingServerRef.current = loadingServer;
  }, [loadingServer]);

  useEffect(() => {
    offlineFallbackRef.current = offlineFallback;
  }, [offlineFallback]);

  useEffect(() => {
    syncingLocalRef.current = syncingLocal;
  }, [syncingLocal]);

  const syncLocalToServer = useCallback(async () => {
    if (!canUseServer || syncingLocalRef.current) return;
    if (savedIds.length === 0) return;
    setSyncingLocal(true);
    try {
      const client = createMobileApiClient({
        baseUrl,
        useMock: false,
        token: token || undefined
      });
      const server = await client.listSaves();
      const serverSet = new Set(server.productGids || []);
      const toSync = savedIds.filter((id) => !serverSet.has(id));
      if (toSync.length) {
        await Promise.all(toSync.map((id) => client.toggleSave(id, true)));
      }
      await refreshServer();
    } catch {
      // ignore sync errors
    } finally {
      setSyncingLocal(false);
    }
  }, [baseUrl, canUseServer, refreshServer, savedIds, token]);

  useEffect(() => {
    if (!canUseServer) return;
    void syncLocalToServer();
  }, [canUseServer, syncLocalToServer]);

  const shouldFallbackToLocal =
    offlineFallback || !canUseServer || (serverArtworks.length === 0 && savedArtworks.length > 0);
  const displayedArtworks = shouldFallbackToLocal ? savedArtworks : serverArtworks;

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

  if (displayedArtworks.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No saved artworks yet</Text>
        <Text style={styles.emptyText}>No saves yet → double tap artworks in the feed.</Text>
      </View>
    );
  }

  const renderRightActions = (_: any, __: any, id: string) => (
    <View style={styles.swipeAction}>
      <Text style={styles.swipeActionText}>Remove</Text>
    </View>
  );

  return (
    <View style={styles.savedContainer}>
      {shouldFallbackToLocal && canUseServer ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>Showing cached saves</Text>
        </View>
      ) : null}
      {loading || loadingServer || syncingLocal ? <ActivityIndicator style={styles.savedLoader} /> : null}
      <FlatList
        data={displayedArtworks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.savedGrid, { paddingHorizontal: 20, paddingBottom: 32 }]}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: tileGap, marginBottom: tileGap } : undefined}
        refreshControl={
          canUseServer && !offlineFallback ? (
            <RefreshControl refreshing={loadingServer} onRefresh={refreshServer} />
          ) : undefined
        }
        onEndReached={
          canUseServer && !offlineFallback ? () => void loadServerSaves("more") : undefined
        }
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <Swipeable
            renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item.id)}
            rightThreshold={42}
            onSwipeableOpen={async () => {
              await toggleSaved(item.id);
              if (canUseServer) {
                await refreshServer();
              }
            }}
          >
            <Pressable
              onPress={() => navigation.navigate("ArtworkDetail", { id: item.id })}
              style={[styles.savedTile, { width: tileSize, height: tileSize * 1.25 }]}
            >
              <Image
                source={{ uri: item.media[0]?.url ?? "https://picsum.photos/seed/saved/600/600" }}
                style={styles.savedTileImage}
                contentFit="cover"
                transition={160}
                cachePolicy="disk"
              />
              <View style={styles.savedTileOverlay} />
              <View style={styles.savedTileText}>
                <Text numberOfLines={2} style={styles.savedTileTitle}>
                  {item.title}
                </Text>
              </View>
            </Pressable>
          </Swipeable>
        )}
      />
    </View>
  );
}

function ProfileScreen() {
  const {
    baseUrl,
    setBaseUrl,
    useMock,
    setUseMock,
    devUnlocked,
    setDevUnlocked,
    clearAllCache,
    clearFeedCache,
    clearReactionCache,
    clearSavedCache,
    user,
    showAuth
  } = useAppContext();
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const [lastTapAt, setLastTapAt] = useState(0);
  const versionLabel = appConfig?.expo?.version ? `Version ${appConfig.expo.version}` : "Version";

  const unlockDev = useCallback(() => {
    setDevUnlocked(true);
    setDevPanelOpen(true);
  }, [setDevUnlocked]);

  const handleVersionTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapAt > 1500) {
      setTapCount(1);
    } else {
      setTapCount((prev) => prev + 1);
    }
    setLastTapAt(now);
  }, [lastTapAt]);

  useEffect(() => {
    if (tapCount >= 7) {
      unlockDev();
      setTapCount(0);
    }
  }, [tapCount, unlockDev]);

  return (
    <View style={styles.profileContainer}>
      <View style={styles.profileCard}>
        <Text style={styles.profileLabel}>Account</Text>
        {user ? (
          <Text style={styles.profileValue}>{user.name ? `${user.name} · ${user.email}` : user.email}</Text>
        ) : (
          <>
            <Text style={styles.profileValue}>Guest</Text>
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

      <Pressable
        onPress={handleVersionTap}
        onLongPress={unlockDev}
        delayLongPress={3000}
        style={styles.profileCard}
      >
        <Text style={styles.profileLabel}>App</Text>
        <Text style={styles.profileValue}>{versionLabel}</Text>
        <Text style={styles.profileHint}>Long press to unlock developer settings.</Text>
      </Pressable>

      {devUnlocked ? (
        <View style={styles.profileCard}>
          <Pressable onPress={() => setDevPanelOpen((prev) => !prev)} style={styles.devHeader}>
            <Text style={styles.profileLabel}>Developer Settings</Text>
            <Text style={styles.profileValue}>{devPanelOpen ? "Hide" : "Show"}</Text>
          </Pressable>
          {devPanelOpen ? (
            <View style={styles.devPanel}>
              <Text style={styles.devLabel}>API Base URL</Text>
              <TextInput
                value={baseUrl}
                onChangeText={setBaseUrl}
                placeholder={DEFAULT_BASE_URL || "https://api.example.com"}
                autoCapitalize="none"
                style={styles.devInput}
              />
              <View style={styles.profileRow}>
                <Text style={styles.profileValue}>Mock Mode</Text>
                <Switch value={useMock} onValueChange={setUseMock} />
              </View>
              <View style={styles.devButtons}>
                <Pressable onPress={clearSavedCache} style={styles.devButton}>
                  <Text style={styles.devButtonText}>Clear saves</Text>
                </Pressable>
                <Pressable onPress={clearFeedCache} style={styles.devButton}>
                  <Text style={styles.devButtonText}>Clear feed</Text>
                </Pressable>
                <Pressable onPress={clearReactionCache} style={styles.devButton}>
                  <Text style={styles.devButtonText}>Clear reactions</Text>
                </Pressable>
                <Pressable onPress={clearAllCache} style={styles.devButtonPrimary}>
                  <Text style={styles.devButtonPrimaryText}>Clear all</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
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

function ReactionPicker() {
  const { reactionTarget, reactionAnchor, closeReactionPicker, submitReaction } = useAppContext();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  if (!reactionTarget) return null;

  const popoverWidth = 220;
  const popoverHeight = 64;
  const anchorX = reactionAnchor?.x ?? width / 2;
  const anchorY = reactionAnchor?.y ?? height / 2;
  let left = anchorX - popoverWidth / 2;
  left = Math.max(12, Math.min(left, width - popoverWidth - 12));
  let top = anchorY - popoverHeight - 12;
  if (top < insets.top + 8) {
    top = anchorY + 12;
  }
  top = Math.max(insets.top + 8, Math.min(top, height - popoverHeight - 12));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeReactionPicker}>
      <Pressable style={styles.reactionOverlay} onPress={closeReactionPicker}>
        <View style={[styles.reactionPopover, { top, left, width: popoverWidth, height: popoverHeight }]}>
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
              <Stack.Screen name="Artist" component={ArtistScreen} options={{ title: "" }} />
            </Stack.Navigator>
          </NavigationContainer>
          <AuthModal />
          <ReactionPicker />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function formatPrice(value: number) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 0 });
}

function ToastOverlay({ text }: { text: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={[styles.toastContainer, { bottom: insets.bottom + 120 }]}
    >
      <View style={styles.toastBubble}>
        <Text style={styles.toastText}>{text}</Text>
      </View>
    </View>
  );
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
  feedTopGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "30%"
  },
  feedTitleBlur: {
    alignSelf: "flex-start",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.2)"
  },
  feedTitleInner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "92%"
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
  pollCard: {
    marginHorizontal: 18,
    marginVertical: 18,
    padding: 20,
    borderRadius: 28,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    gap: 16
  },
  pollTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center"
  },
  pollOptions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    flexWrap: "wrap"
  },
  pollOption: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)"
  },
  pollOptionSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF"
  },
  pollOptionText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  pollOptionTextSelected: {
    color: "#0B0B0B"
  },
  pollAnswerText: {
    color: "rgba(255,255,255,0.75)",
    textAlign: "center"
  },
  pollHintText: {
    color: "rgba(255,255,255,0.45)",
    textAlign: "center"
  },
  shareCardHost: {
    position: "absolute",
    left: -2000,
    top: 0
  },
  shareCard: {
    width: 1080,
    height: 1350,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "#0E0E0E"
  },
  shareCardImage: {
    ...StyleSheet.absoluteFillObject
  },
  shareCardGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "55%"
  },
  shareCardContent: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 36,
    gap: 10
  },
  shareCardBrand: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 16,
    letterSpacing: 2,
    fontWeight: "700"
  },
  shareCardTitle: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700"
  },
  shareCardArtist: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 20
  },
  shareCardLinks: {
    marginTop: 8,
    gap: 4
  },
  shareCardLink: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 16
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
  toastContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center"
  },
  toastBubble: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(10,10,10,0.82)"
  },
  toastText: {
    color: "#FFFFFF",
    fontWeight: "600"
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
  detailHero: {
    width: "100%",
    backgroundColor: "#0E0E0E"
  },
  detailTopGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "30%"
  },
  detailHeroPressable: {
    flex: 1
  },
  detailHeroImage: {
    backgroundColor: "#0E0E0E"
  },
  detailDots: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6
  },
  detailDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.45)"
  },
  detailDotActive: {
    backgroundColor: "#FFFFFF"
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
  savedGrid: {
    paddingTop: 16
  },
  savedTile: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E6E1DC"
  },
  savedTileImage: {
    ...StyleSheet.absoluteFillObject
  },
  savedTileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)"
  },
  savedTileText: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12
  },
  savedTileTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600"
  },
  debugOverlay: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.08)"
  },
  debugOverlayText: {
    color: "#222222",
    fontSize: 11,
    lineHeight: 14
  },
  offlineBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignSelf: "center"
  },
  offlineBannerText: {
    color: "#3F3F3F",
    fontSize: 12,
    fontWeight: "600"
  },
  artistContainer: {
    flex: 1,
    backgroundColor: NAV_THEME.colors.background
  },
  artistHeader: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 10
  },
  artistAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E0DAD4"
  },
  artistAvatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36
  },
  artistName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#151515"
  },
  artistBio: {
    color: "#6B6B6B"
  },
  artistGrid: {
    paddingHorizontal: 20,
    paddingTop: 4
  },
  artistTile: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#E6E1DC"
  },
  artistTileImage: {
    ...StyleSheet.absoluteFillObject
  },
  artistTileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)"
  },
  artistTileText: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12
  },
  artistTileTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600"
  },
  swipeAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 96,
    backgroundColor: "#111111",
    borderRadius: 18,
    marginLeft: 10
  },
  swipeActionText: {
    color: "#FFFFFF",
    fontWeight: "600"
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
  devHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  devPanel: {
    marginTop: 12,
    gap: 12
  },
  devLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#7A7A7A"
  },
  devInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111111",
    backgroundColor: "#F9F7F4"
  },
  devButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  devButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)"
  },
  devButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1A1A1A"
  },
  devButtonPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#111111"
  },
  devButtonPrimaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF"
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
  reactionOverlay: {
    flex: 1,
    backgroundColor: "transparent"
  },
  reactionPopover: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(20,20,20,0.9)"
  },
  reactionEmojiButton: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)"
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
