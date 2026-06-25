export type BottomNavItem = {
  href: string;
  label: string;
  icon: "home" | "artworks" | "analytics" | "earnings" | "profile" | "settings";
};

export const bottomNavItems: BottomNavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/artworks", label: "Artworks", icon: "artworks" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/earnings", label: "Earnings", icon: "earnings" },
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const publicRoutes = ["/login", "/register", "/account-pending"] as const;
export const protectedRoutes = ["/", "/onboarding", "/artworks", "/analytics", "/earnings", "/media", "/profile", "/settings", "/series", "/messages", "/announcements"] as const;
