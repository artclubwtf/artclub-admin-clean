"use client";

type EditIconButtonProps = {
  label: string;
  onClick: () => void;
  className?: string;
};

export function EditIconButton({ label, onClick, className }: EditIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-neutral-500 transition-colors hover:text-neutral-950 ${className || ""}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
        <path
          d="M4 16.8V20h3.2l9.4-9.4-3.2-3.2L4 16.8Zm11.7-10.9 1.8-1.8a1.7 1.7 0 0 1 2.4 0l.9.9a1.7 1.7 0 0 1 0 2.4L19 9.2l-3.3-3.3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
