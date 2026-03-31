import styles from "./ArtistsPrimitives.module.css";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyTitle}>{title}</div>
      <div className={styles.emptyDescription}>{description}</div>
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}
