export function Chip({ label, tone = "default", className }: { label: string; tone?: "default" | "muted" | "success" | "warn" | "danger"; className?: string }) {
  const toneClass =
    tone === "success"
      ? "ui-chip-success"
      : tone === "warn"
        ? "ui-chip-warn"
        : tone === "danger"
          ? "ui-chip-danger"
          : tone === "muted"
            ? "ui-chip-muted"
            : "ui-chip";
  return <span className={["ui-chip", toneClass, className].filter(Boolean).join(" ")}>{label}</span>;
}
