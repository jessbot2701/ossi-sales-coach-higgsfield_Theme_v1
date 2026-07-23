import { Brand } from "@/components/brand";
import { OssiPortrait } from "@/components/ossi-portrait";
import { SetPasswordForm } from "@/components/set-password-form";

export default function SetPasswordPage() {
  return <main className="auth-shell"><div className="auth-portrait-shell"><OssiPortrait variant="auth" /></div><section className="auth-card"><Brand /><div className="auth-heading"><p className="eyebrow"><span /> Konto schützen</p><h1>Passwort festlegen</h1><p>Wähle ein persönliches Passwort mit mindestens zehn Zeichen.</p></div><SetPasswordForm /></section></main>;
}
