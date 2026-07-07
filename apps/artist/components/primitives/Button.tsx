import type { ButtonHTMLAttributes, ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/cn";

type ButtonTone = "primary" | "secondary" | "ghost";

type SharedProps = {
  children: ReactNode;
  className?: string;
  tone?: ButtonTone;
};

type LinkButtonProps = SharedProps & {
  href: string;
};

type NativeButtonProps = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonProps = LinkButtonProps | NativeButtonProps;

const tones: Record<ButtonTone, string> = {
  primary: "bg-[var(--accent)] text-[var(--accent-text)]",
  secondary: "bg-[var(--surface-soft)] text-[var(--text)]",
  ghost: "bg-transparent text-[var(--text-muted)]",
};

const baseClassName =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium tracking-[-0.01em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--divider)] disabled:cursor-not-allowed disabled:opacity-50";

export function Button(props: ButtonProps) {
  const tone = props.tone || "primary";
  const className = cn(baseClassName, tones[tone], props.className);

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={className}>
        {props.children}
      </Link>
    );
  }

  const { children, className: _className, tone: _tone, ...buttonProps } = props;

  return (
    <button {...buttonProps} className={className}>
      {children}
    </button>
  );
}
