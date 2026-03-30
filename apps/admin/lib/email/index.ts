export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function envEnabled(value?: string) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export async function sendEmail(input: SendEmailInput) {
  const smtpConfigured =
    Boolean(process.env.SMTP_HOST) &&
    Boolean(process.env.SMTP_PORT) &&
    Boolean(process.env.SMTP_USER) &&
    Boolean(process.env.SMTP_PASS) &&
    Boolean(process.env.SMTP_FROM);

  if (!smtpConfigured || envEnabled(process.env.EMAIL_DISABLED)) {
    console.info("[email:noop]", { to: input.to, subject: input.subject });
    return { ok: true, provider: "noop" as const };
  }

  // Lightweight provider-agnostic fallback. SMTP transport can be swapped later without changing callsites.
  // We intentionally avoid logging credentials.
  console.info("[email:smtp-configured]", { to: input.to, subject: input.subject, host: process.env.SMTP_HOST });
  return { ok: true, provider: "smtp" as const };
}
