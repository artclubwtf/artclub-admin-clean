"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/primitives/Button";
import { cn } from "@/lib/cn";

export type MultiStepDefinition = {
  key: string;
  title: string;
  description?: string;
};

type MultiStepFormProps = {
  steps: MultiStepDefinition[];
  currentStep: number;
  onBack?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  isLastStep?: boolean;
  nextLabel?: string;
  backLabel?: string;
  submitLabel?: string;
  isSubmitting?: boolean;
  children: ReactNode;
  footerHint?: ReactNode;
  className?: string;
};

export function MultiStepForm({
  steps,
  currentStep,
  onBack,
  onNext,
  onSubmit,
  canGoBack = true,
  canGoNext = true,
  isLastStep = false,
  nextLabel = "Continue",
  backLabel = "Back",
  submitLabel = "Save",
  isSubmitting = false,
  children,
  footerHint,
  className,
}: MultiStepFormProps) {
  const activeStep = steps[currentStep];

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">
            Step {currentStep + 1} of {steps.length}
          </div>
          <div className="text-sm text-neutral-400">{activeStep?.title}</div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
          {steps.map((step, index) => (
            <div key={step.key} className="space-y-2">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors",
                  index < currentStep ? "bg-neutral-950" : index === currentStep ? "bg-neutral-500" : "bg-neutral-200",
                )}
              />
              <div className="space-y-0.5">
                <div className={cn("text-sm font-medium tracking-[-0.02em]", index === currentStep ? "text-neutral-950" : "text-neutral-400")}>
                  {step.title}
                </div>
                {index === currentStep && step.description ? <div className="text-sm leading-6 text-neutral-500">{step.description}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-5">{children}</div>

      <div className="space-y-3">
        {footerHint ? <div>{footerHint}</div> : null}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" tone="ghost" onClick={onBack} disabled={!canGoBack || isSubmitting}>
            {backLabel}
          </Button>
          {isLastStep ? (
            <Button type="button" onClick={onSubmit} disabled={!canGoNext || isSubmitting}>
              {isSubmitting ? "Saving..." : submitLabel}
            </Button>
          ) : (
            <Button type="button" onClick={onNext} disabled={!canGoNext || isSubmitting}>
              {nextLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
