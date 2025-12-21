import Link from "next/link";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ApSection({
  as: Tag = "section",
  className,
  children,
  ...rest
}: PropsWithChildren<{ as?: keyof JSX.IntrinsicElements; className?: string } & ComponentProps<"div">>) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore allow dynamic tag
  return <Tag className={cx("ap-section", className)} {...rest}>{children}</Tag>;
}

export function ApSectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ap-section-header">
      <div>
        <div className="ap-section-title">{title}</div>
        {subtitle ? <div className="ap-section-subtitle">{subtitle}</div> : null}
      </div>
      {action ? <div className="ap-section-action">{action}</div> : null}
    </div>
  );
}

type ApRowProps = {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  href?: string;
  className?: string;
  chevron?: boolean;
  onClick?: () => void;
};

export function ApRow({ title, subtitle, meta, action, icon, href, className, chevron = false, onClick }: ApRowProps) {
  const Inner = (
    <div className={cx("ap-row", className)}>
      {icon ? (
        <div className="ap-row-icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <div className="ap-row-main">
        <div className="ap-row-title">{title}</div>
        {subtitle ? <div className="ap-row-sub">{subtitle}</div> : null}
      </div>
      {(meta || action || chevron) && (
        <div className="ap-row-meta">
          {meta}
          {action}
          {chevron ? <span className="ap-row-chevron" aria-hidden>›</span> : null}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="ap-row-link">
        {Inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className="ap-row-link" onClick={onClick}>
        {Inner}
      </button>
    );
  }

  return <div className="ap-row-link">{Inner}</div>;
}
