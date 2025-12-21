"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { ApSection, ApSectionHeader } from "@/components/artist/ApElements";

type FormState = {
  accountHolder: string;
  iban: string;
  bic: string;
  bankName: string;
  address: string;
  taxId: string;
};

const initialState: FormState = {
  accountHolder: "",
  iban: "",
  bic: "",
  bankName: "",
  address: "",
  taxId: "",
};

export default function PayoutRequestPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/artist/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payout: { ...form },
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(payload?.error || "Request failed");
      setSuccess("Your change request has been submitted. The team will review it.");
      setForm(initialState);
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ApSection>
        <ApSectionHeader
          title="Request payout change"
          subtitle="Submit updated payout details. The team will review and confirm any changes."
          action={
            <Link href="/artist/payout" className="ap-btn-ghost">
              Back to payout
            </Link>
          }
        />
      </ApSection>

      <ApSection as="form" className="space-y-3" onSubmit={handleSubmit}>
        <div className="ap-form-grid">
          <Field label="Account holder" value={form.accountHolder} onChange={(v) => setForm((s) => ({ ...s, accountHolder: v }))} />
          <Field label="IBAN" value={form.iban} onChange={(v) => setForm((s) => ({ ...s, iban: v }))} />
          <Field label="BIC" value={form.bic} onChange={(v) => setForm((s) => ({ ...s, bic: v }))} />
          <Field label="Bank name" value={form.bankName} onChange={(v) => setForm((s) => ({ ...s, bankName: v }))} />
          <Field label="Address" value={form.address} onChange={(v) => setForm((s) => ({ ...s, address: v }))} />
          <Field label="Tax ID" value={form.taxId} onChange={(v) => setForm((s) => ({ ...s, taxId: v }))} />
        </div>

        {error && <div className="ap-note">Error: {error}</div>}
        {success && <div className="ap-note">Success: {success}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="ap-btn" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit request"}
          </button>
          <Link href="/artist/payout" className="ap-btn-ghost">
            Cancel
          </Link>
        </div>
      </ApSection>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="ap-field">
      <label>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} />
    </div>
  );
}
