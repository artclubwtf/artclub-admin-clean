export type NavigationIcon = "home" | "explore" | "events" | "messages" | "profile" | "network" | "notifications" | "artworks" | "analytics" | "earnings" | "settings";
export type BottomNavItem = { id: string; href: string; label: string; icon: NavigationIcon; analyticsEvent?: string };

export const primaryNavigation: BottomNavItem[] = [
  { id: "home", href: "/home", label: "Home", icon: "home", analyticsEvent: "navigation_home" },
  { id: "network", href: "/network", label: "Network", icon: "network", analyticsEvent: "navigation_network" },
  { id: "messages", href: "/messages", label: "Messages", icon: "messages", analyticsEvent: "navigation_messages" },
  { id: "events", href: "/events", label: "Events", icon: "events", analyticsEvent: "navigation_events" },
  { id: "profile", href: "/profile", label: "Profile", icon: "profile", analyticsEvent: "navigation_profile" },
];

export const secondaryNavigation = {
  updates: { id: "updates", href: "/updates", label: "Updates", icon: "home" as const, analyticsEvent: "updates_view" },
  explore: { id: "explore", href: "/explore-art", label: "Explore Art", icon: "explore" as const, analyticsEvent: "navigation_explore_opened" },
  notifications: { id: "notifications", href: "/notifications", label: "Notifications", icon: "notifications" as const, analyticsEvent: "navigation_notifications" },
};

export const networkNavItems = primaryNavigation;

export const bottomNavItems: BottomNavItem[] = [
  { id: "home", href: "/", label: "Home", icon: "home" },
  { id: "artworks", href: "/artworks", label: "Artworks", icon: "artworks" },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: "analytics" },
  { id: "earnings", href: "/earnings", label: "Earnings", icon: "earnings" },
  { id: "profile", href: "/profile", label: "Profile", icon: "profile" },
  { id: "settings", href: "/settings", label: "Settings", icon: "settings" },
];

export const publicRoutes = ["/login", "/register", "/account-pending"] as const;
export const protectedRoutes = ["/", "/home", "/updates", "/onboarding", "/artworks", "/analytics", "/earnings", "/media", "/profile", "/settings", "/series", "/messages", "/announcements", "/explore-art"] as const;
