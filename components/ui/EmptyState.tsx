import type { ReactNode } from "react";
import { Card } from "./Card";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <Card className="ui-empty">
      <div className="ui-empty-title">{title}</div>
      {description ? <div className="ui-empty-desc">{description}</div> : null}
      {action ? <div className="ui-empty-action">{action}</div> : null}
    </Card>
  );
}
