"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { readImplicitSession } from "@/lib/supabase/implicit-session";

export function SetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preparingLink, setPreparingLink] = useState(true);

  useEffect(() => {
    let active = true;

    async function prepareLink() {
      const implicitSession = readImplicitSession(window.location.hash);
      if (!implicitSession) {
        if (active) setPreparingLink(false);
        return;
      }

      const { error: sessionError } = await createClient().auth.setSession({
        access_token: implicitSession.accessToken,
        refresh_token: implicitSession.refreshToken,
      });
      if (!active) return;

      if (sessionError) {
        setError("Der Einladungslink ist ungültig oder bereits verwendet. Bitte fordere einen neuen Passwort-Link an.");
      } else {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      setPreparingLink(false);
    }

    void prepareLink();
    return () => { active = false; };
  }, []);

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
      <button className="button button-primary" disabled={loading || preparingLink}>
        {preparingLink ? "Einladungslink wird geprüft …" : loading ? "Speichern …" : "Passwort festlegen"}
      </button>
    </form>
  );
}
