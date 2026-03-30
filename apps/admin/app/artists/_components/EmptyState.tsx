type EmptyStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-sm text-slate-600">{description}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
