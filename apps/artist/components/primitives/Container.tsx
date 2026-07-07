import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type ContainerProps = {
  children: ReactNode;
  className?: string;
};

export function Container({ children, className }: ContainerProps) {
  return <div className={cn("mx-auto w-full max-w-7xl px-3 sm:px-4 lg:px-8", className)}>{children}</div>;
}
