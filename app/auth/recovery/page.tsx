import { Brand } from "@/components/brand";
import { OssiPortrait } from "@/components/ossi-portrait";
import { isRecoveryToken } from "@/lib/supabase/recovery-link";

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  const valid = isRecoveryToken(token);

  return (
    <main className="auth-shell">
      <div className="auth-portrait-shell"><OssiPortrait variant="auth" /></div>
      <section className="auth-card">
        <Brand />
        <div className="auth-heading">
          <p className="eyebrow"><span /> Sicherer Passwort-Link</p>
          <h1>Passwort festlegen</h1>
          <p>
            {valid
              ? "Bestätige den Link mit einem bewussten Klick. Erst danach wird die einmalige Berechtigung verwendet."
              : "Dieser Passwort-Link ist unvollständig oder ungültig."}
          </p>
        </div>
        {valid ? (
          <form className="form-stack" action="/auth/recovery/continue" method="post">
            <input type="hidden" name="token" value={token} />
            <button className="button button-primary" type="submit">Passwort-Link öffnen</button>
          </form>
        ) : (
          <a className="button button-primary" href="/login">Zur Anmeldung</a>
        )}
      </section>
    </main>
  );
}
