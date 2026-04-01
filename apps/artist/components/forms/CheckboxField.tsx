type CheckboxFieldProps = {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function CheckboxField({ label, hint, checked, onChange, disabled }: CheckboxFieldProps) {
  return (
    <label className="flex items-start gap-3 rounded-[1.75rem] bg-neutral-50 px-4 py-4">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-neutral-950"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium tracking-[-0.01em] text-neutral-900">{label}</span>
        {hint ? <span className="block text-sm leading-6 text-neutral-500">{hint}</span> : null}
      </span>
    </label>
  );
}
