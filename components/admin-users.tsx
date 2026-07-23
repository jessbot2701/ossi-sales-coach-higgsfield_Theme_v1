"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type AdminUserRow = { id: string; email: string; displayName: string; isActive: boolean; role: string; createdAt: string };

export function AdminUsers({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const inviteInFlight = useRef(false);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteInFlight.current) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    inviteInFlight.current = true;
    setInviting(true); setError(null); setMessage(null);

    try {
      const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), displayName: data.get("displayName"), role: data.get("role") }) });
      const result = await response.json();
      if (!response.ok) return setError(result.error || "Die Einladung konnte nicht versendet werden.");
      form.reset(); setMessage("Einladung wurde versendet. Die E-Mail kann wenige Minuten benötigen."); router.refresh();
    } catch {
      setError("Die Einladung konnte nicht versendet werden. Bitte prüfe deine Verbindung und versuche es erneut.");
    } finally {
      inviteInFlight.current = false;
      setInviting(false);
    }
  }

  async function toggle(user: AdminUserRow) {
    setError(null); setMessage(null);
    const response = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: !user.isActive }) });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    setMessage(user.isActive ? "Nutzer wurde gesperrt." : "Nutzer wurde reaktiviert."); router.refresh();
  }

  return (
    <div className="portal-grid admin-grid">
      <section className="portal-card full"><span className="card-label-app">Neues Konto</span><h2>Nutzer einladen</h2><form className="form-stack admin-invite-form" onSubmit={invite} aria-busy={inviting}><div className="field"><label htmlFor="displayName">Anzeigename</label><input id="displayName" name="displayName" required maxLength={120} /></div><div className="field"><label htmlFor="email">E-Mail-Adresse</label><input id="email" name="email" type="email" required /></div><div className="field"><label htmlFor="role">Rolle</label><select id="role" name="role"><option value="user">Nutzer</option><option value="admin">Administrator</option></select></div>{error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message" role="status">{message}</p>}<button className="button button-primary" type="submit" disabled={inviting}>{inviting ? "Einladung wird versendet …" : "Einladung senden"}</button></form></section>
      <section className="portal-card full table-card"><span className="card-label-app">{users.length} Konten</span><h2>Nutzerkonten</h2><div className="table-wrap"><table><thead><tr><th>Nutzer</th><th>Rolle</th><th>Status</th><th>Seit</th><th>Aktion</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><br /><small>{user.email}</small></td><td>{user.role}</td><td><span className={`badge ${user.isActive ? "success" : "warning"}`}>{user.isActive ? "Aktiv" : "Gesperrt"}</span></td><td>{new Intl.DateTimeFormat("de-DE").format(new Date(user.createdAt))}</td><td><button className="button button-small button-table" type="button" onClick={() => toggle(user)}>{user.isActive ? "Sperren" : "Reaktivieren"}</button></td></tr>)}</tbody></table></div></section>
    </div>
  );
}
