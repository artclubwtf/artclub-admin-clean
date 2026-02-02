import type { ReactNode } from "react";

export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="ui-page-title">
      <div>
        <div className="ui-page-title-text">{title}</div>
        {description ? <div className="ui-page-title-sub">{description}</div> : null}
      </div>
      {actions ? <div className="ui-page-title-actions">{actions}</div> : null}
    </div>
  );
}
