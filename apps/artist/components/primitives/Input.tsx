import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Input({ className, label, hint, ...props }: InputProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">{label}</span>
      <input
        {...props}
        className={cn(
          "w-full rounded-3xl bg-neutral-100 px-4 py-3.5 text-[15px] text-neutral-950 placeholder:text-neutral-400 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10",
          className
        )}
      />
      {hint ? <span className="block text-sm leading-6 text-neutral-500">{hint}</span> : null}
    </label>
  );
}
