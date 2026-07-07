export type NavigationIcon = "home" | "explore" | "events" | "messages" | "profile" | "network" | "notifications" | "artworks" | "analytics" | "earnings" | "settings";
export type BottomNavItem = { id: string; href: string; label: string; icon: NavigationIcon; analyticsEvent?: string };

export const primaryNavigation: BottomNavItem[] = [
  { id: "feed", href: "/feed", label: "Feed", icon: "home", analyticsEvent: "navigation_feed_opened" },
  { id: "explore", href: "/explore-art", label: "Explore Art", icon: "explore", analyticsEvent: "navigation_explore_opened" },
  { id: "events", href: "/events", label: "Events", icon: "events", analyticsEvent: "navigation_events_opened" },
  { id: "messages", href: "/messages", label: "Messages", icon: "messages", analyticsEvent: "navigation_messages_opened" },
  { id: "profile", href: "/profile", label: "Profile", icon: "profile" },
];

export const secondaryNavigation = {
  network: { id: "network", href: "/network", label: "Network", icon: "network" as const, analyticsEvent: "navigation_network_opened" },
  notifications: { id: "notifications", href: "/notifications", label: "Notifications", icon: "notifications" as const },
};

export const networkNavItems = primaryNavigation.filter(item => item.id !== "messages");

export const bottomNavItems: BottomNavItem[] = [
  { id: "home", href: "/", label: "Home", icon: "home" },
  { id: "artworks", href: "/artworks", label: "Artworks", icon: "artworks" },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: "analytics" },
  { id: "earnings", href: "/earnings", label: "Earnings", icon: "earnings" },
  { id: "profile", href: "/profile", label: "Profile", icon: "profile" },
  { id: "settings", href: "/settings", label: "Settings", icon: "settings" },
];

export const publicRoutes = ["/login", "/register", "/account-pending"] as const;
export const protectedRoutes = ["/", "/onboarding", "/artworks", "/analytics", "/earnings", "/media", "/profile", "/settings", "/series", "/messages", "/announcements", "/explore-art"] as const;
