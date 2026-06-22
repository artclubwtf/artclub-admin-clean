export type BottomNavItem = {
  href: string;
  label: string;
  icon: "home" | "artworks" | "profile" | "settings";
};

export const bottomNavItems: BottomNavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/artworks", label: "Artworks", icon: "artworks" },
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const publicRoutes = ["/login", "/register", "/account-pending"] as const;
export const protectedRoutes = ["/", "/onboarding", "/artworks", "/media", "/profile", "/settings", "/series", "/messages", "/announcements"] as const;
