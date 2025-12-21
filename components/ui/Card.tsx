import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

export function Card({ children, className, style }: PropsWithChildren<{ className?: string; style?: CSSProperties }>) {
  return (
    <div className={["ui-card", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="ui-card-header">
      <div>
        <div className="ui-card-title">{title}</div>
        {subtitle ? <div className="ui-card-sub">{subtitle}</div> : null}
      </div>
      {action ? <div className="ui-card-action">{action}</div> : null}
    </div>
  );
}
