import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export function Textarea({ className, label, hint, ...props }: TextareaProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium tracking-[-0.01em] text-neutral-700">{label}</span>
      <textarea
        {...props}
        className={cn(
          "min-h-32 w-full resize-y rounded-[1.75rem] bg-neutral-100 px-4 py-3.5 text-[15px] leading-6 text-neutral-950 placeholder:text-neutral-400 focus-visible:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950/10",
          className
        )}
      />
      {hint ? <span className="block text-sm leading-6 text-neutral-500">{hint}</span> : null}
    </label>
  );
}
