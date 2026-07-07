import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Input({ className, label, hint, ...props }: InputProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium tracking-[-0.01em] text-[var(--text-muted)]">{label}</span>
      <input
        {...props}
        className={cn(
          "control w-full px-4 text-[15px] text-[var(--text)] placeholder:text-[var(--text-faint)]",
          className
        )}
      />
      {hint ? <span className="block text-sm leading-6 text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}
