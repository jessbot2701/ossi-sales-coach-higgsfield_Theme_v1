"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password.length < 10) return setError("Das Passwort muss mindestens 10 Zeichen lang sein.");
    if (password !== confirmation) return setError("Die Passwörter stimmen nicht überein.");
    setLoading(true); setError(null);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (updateError) return setError("Das Passwort konnte nicht gespeichert werden. Bitte öffne den Link erneut.");
    router.push("/app"); router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="field"><label htmlFor="password">Neues Passwort</label><input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required /></div>
      <div className="field"><label htmlFor="confirmation">Passwort wiederholen</label><input id="confirmation" name="confirmation" type="password" minLength={10} autoComplete="new-password" required /></div>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button button-primary" disabled={loading}>{loading ? "Speichern …" : "Passwort festlegen"}</button>
    </form>
  );
}
