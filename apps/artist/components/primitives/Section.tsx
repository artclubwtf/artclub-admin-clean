import type { ReactNode } from "react";

type SectionProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function Section({ title, subtitle, action, children }: SectionProps) {
  return (
    <section className="space-y-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-neutral-950">{title}</h2>
          {subtitle ? <p className="max-w-xl text-sm leading-6 text-neutral-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
