"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createOssiCue, playOssiCue } from "@/lib/ossi-cue";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next = "/app" }: { next?: string }) {
  const router = useRouter();
  const [resetMode, setResetMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const supabase = createClient();

    if (resetMode) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/auth/callback?next=/set-password`,
      });
      setLoading(false);
      if (resetError?.status === 429 || resetError?.code === "over_email_send_rate_limit") {
        return setError("Das E-Mail-Versandlimit ist gerade erreicht. Bitte in einigen Minuten erneut versuchen.");
      }
      if (resetError) return setError("Der Reset-Link konnte nicht versendet werden.");
      return setMessage("Wenn die Adresse registriert ist, erhältst du gleich einen Reset-Link.");
    }

    const password = String(form.get("password") ?? "");
    const successCue = createOssiCue();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      return setError("E-Mail-Adresse oder Passwort ist nicht korrekt.");
    }
    setMessage("Anmeldung erfolgreich. Ossi ist bereit.");
    await playOssiCue(successCue);
    setLoading(false);
    router.push(safeInternalPath(next));
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="field"><label htmlFor="email">E-Mail-Adresse</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
      {!resetMode && <div className="field"><label htmlFor="password">Passwort</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>}
      {error && <p className="form-message error" role="alert">{error}</p>}
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Bitte warten …" : resetMode ? "Reset-Link senden" : "Anmelden"}</button>
      <button className="plain-button" type="button" onClick={() => { setResetMode(!resetMode); setError(null); setMessage(null); }}>
        {resetMode ? "Zurück zur Anmeldung" : "Passwort vergessen?"}
      </button>
    </form>
  );
}
