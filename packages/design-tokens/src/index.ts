export const artclubTokens = {
  color: {
    light: { background: "#ffffff", surface: "#ffffff", surfaceMuted: "#f5f5f4", text: "#171717", textMuted: "#737373", border: "#e7e5e4", danger: "#c2413a" },
    dark: { background: "#0c0c0c", surface: "#111111", surfaceMuted: "#1a1a1a", text: "#f5f5f4", textMuted: "#a8a29e", border: "#292524", danger: "#fb7185" },
  },
  spacing: { xs: 4, sm: 8, page: 12, md: 16, lg: 24, xl: 32 },
  radius: { none: 0, container: 4, control: 6, media: 8, modal: 8, avatar: 999 },
  typography: { caption: 12, body: 15, section: 18, title: 32 },
  layout: { reading: 672, updates: 700, desktopSidebar: 240, touchTarget: 40 },
} as const;

export type ArtclubTokens = typeof artclubTokens;
