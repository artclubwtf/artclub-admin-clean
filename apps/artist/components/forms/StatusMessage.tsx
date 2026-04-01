type StatusMessageProps = {
  tone: "error" | "success" | "info";
  children: string;
};

const tones: Record<StatusMessageProps["tone"], string> = {
  error: "bg-red-50 text-red-700",
  success: "bg-emerald-50 text-emerald-700",
  info: "bg-neutral-100 text-neutral-600",
};

export function StatusMessage({ tone, children }: StatusMessageProps) {
  return <div className={`rounded-[1.5rem] px-4 py-3 text-sm leading-6 ${tones[tone]}`}>{children}</div>;
}
