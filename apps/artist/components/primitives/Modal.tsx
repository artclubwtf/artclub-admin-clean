"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function Modal({ open, title, subtitle, onClose, children, className }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/28 px-3 py-4 sm:px-6 sm:py-8" onClick={onClose}>
      <div
        className={cn(
          "mx-auto max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white p-4 sm:max-h-[calc(100vh-4rem)] sm:p-6",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-neutral-950">{title}</h2>
            {subtitle ? <p className="max-w-2xl text-sm leading-6 text-neutral-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:text-neutral-950"
            aria-label="Close modal"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              <path d="M6 6 18 18M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
