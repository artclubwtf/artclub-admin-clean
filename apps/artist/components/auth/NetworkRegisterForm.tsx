"use client";
import { FormEvent, useRef, useState } from "react";
import { signIn } from "next-auth/react";

const messages: Record<string, string> = {
  email_already_registered: "Diese E-Mail ist bereits registriert. Bitte melde dich an.",
  invalid_registration: "Bitte prüfe Name, E-Mail und Passwort.",
  rate_limited: "Zu viele Registrierungsversuche. Bitte versuche es in einer Minute erneut.",
  network_registration_setup_required: "Die Registrierung ist vorübergehend nicht verfügbar.",
  registration_conflict: "Die Registrierung konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
  registration_failed: "Die Registrierung konnte nicht abgeschlossen werden.",
  login_failed: "Der Account wurde erstellt, aber die Anmeldung ist fehlgeschlagen. Bitte melde dich an.",
};

export function NetworkRegisterForm() {
  const [value, setValue] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const attemptId = useRef(crypto.randomUUID());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    setError("");
    try {
      const email = value.email.trim().toLowerCase();
      const response = await fetch("/api/network/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, email, registrationAttemptId: attemptId.current }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.code || "registration_failed");
      const login = await signIn("credentials", { email, password: value.password, redirect: false });
      if (login?.error) throw new Error("login_failed");
      location.href = "/onboarding/role";
    } catch (reason: any) {
      const code = reason?.message || "registration_failed";
      setError(messages[code] || messages.registration_failed);
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  return <form onSubmit={submit} className="w-full max-w-md space-y-5"><div><p className="text-sm uppercase tracking-widest text-neutral-400">ARTCLUB Network</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Join the network of art</h1></div>{[["name","Name","text"],["email","Email","email"],["password","Password (10+ characters)","password"]].map(([key,label,type])=><label key={key} className="block"><span className="mb-1 block text-sm">{label}</span><input required disabled={isSubmitting} type={type} value={(value as any)[key]} onChange={event=>setValue({...value,[key]:event.target.value})} className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 disabled:opacity-60"/></label>)}{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-neutral-950 py-3 text-white disabled:opacity-50">{isSubmitting?"Creating account…":"Create account"}</button></form>;
}
