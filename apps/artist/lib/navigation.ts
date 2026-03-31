export type BottomNavItem = {
  href: string;
  label: string;
  icon: "home" | "artworks" | "media" | "profile" | "settings";
};

export const bottomNavItems: BottomNavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/artworks", label: "Artworks", icon: "artworks" },
  { href: "/media", label: "Media", icon: "media" },
  { href: "/profile", label: "Profile", icon: "profile" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const publicRoutes = ["/login", "/register"] as const;
export const protectedRoutes = ["/", "/onboarding", "/artworks", "/media", "/profile", "/settings"] as const;
