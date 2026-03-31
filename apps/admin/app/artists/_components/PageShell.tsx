import styles from "./ArtistsPrimitives.module.css";

type PageShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export default function PageShell({ title, subtitle, actions, children }: PageShellProps) {
  return (
    <div className={styles.pageShell}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{title}</h1>
          {subtitle ? <p className={styles.pageSubtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div className={styles.pageActions}>{actions}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}
