import type { ReactNode } from "react";

import "./apply.css";

export default function ApplyLayout({ children }: { children: ReactNode }) {
  return <div className="ap-apply">{children}</div>;
}
