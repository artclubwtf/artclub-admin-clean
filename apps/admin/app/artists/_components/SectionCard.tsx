type SectionCardProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export default function SectionCard({ title, subtitle, actions, children }: SectionCardProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
