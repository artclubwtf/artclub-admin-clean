import type { ReactNode } from "react";

type PageTitleProps = {
  title: string;
  subtitle: string;
  action?: ReactNode;
};

export function PageTitle({ title, subtitle, action }: PageTitleProps) {
  return (
    <header className="space-y-4 pt-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">ARTCLUB for Artists</p>
          <h1 className="page-heading text-[var(--text)]">{title}</h1>
          <p className="max-w-xl text-sm leading-6 text-[var(--text-muted)] sm:text-[0.95rem]">{subtitle}</p>
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
    </header>
  );
}
