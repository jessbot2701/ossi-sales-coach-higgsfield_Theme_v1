"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  role: string;
  createdAt: string;
};

export function AdminUsers({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const inviteInFlight = useRef(false);
  const deleteInFlight = useRef(false);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteInFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    inviteInFlight.current = true;
    setInviting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          displayName: data.get("displayName"),
          role: data.get("role"),
        }),
      });
      const result = await response.json();
      if (!response.ok) return setError(result.error || "Die Einladung konnte nicht versendet werden.");
      form.reset();
      setMessage("Einladung wurde versendet. Die E-Mail kann wenige Minuten benötigen.");
      router.refresh();
    } catch {
      setError("Die Einladung konnte nicht versendet werden. Bitte prüfe deine Verbindung und versuche es erneut.");
    } finally {
      inviteInFlight.current = false;
      setInviting(false);
    }
  }

  async function toggle(user: AdminUserRow) {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    setMessage(user.isActive ? "Nutzer wurde gesperrt." : "Nutzer wurde reaktiviert.");
    router.refresh();
  }

  function openDeleteDialog(user: AdminUserRow) {
    setError(null);
    setMessage(null);
    setConfirmationEmail("");
    setDeleteTarget(user);
  }

  async function deleteUser() {
    if (!deleteTarget || deleteInFlight.current || confirmationEmail !== deleteTarget.email) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmationEmail }),
      });
      const result = await response.json();
      if (!response.ok) return setError(result.error || "Das Nutzerkonto konnte nicht gelöscht werden.");
      setDeleteTarget(null);
      setConfirmationEmail("");
      setMessage(`Das Konto ${deleteTarget.email} wurde endgültig gelöscht.`);
      router.refresh();
    } catch {
      setError("Das Nutzerkonto konnte nicht gelöscht werden. Bitte prüfe deine Verbindung und versuche es erneut.");
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="portal-grid admin-grid">
        <section className="portal-card full">
          <span className="card-label-app">Neues Konto</span>
          <h2>Nutzer einladen</h2>
          <form className="form-stack admin-invite-form" onSubmit={invite} aria-busy={inviting}>
            <div className="field"><label htmlFor="displayName">Anzeigename</label><input id="displayName" name="displayName" required maxLength={120} /></div>
            <div className="field"><label htmlFor="email">E-Mail-Adresse</label><input id="email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="role">Rolle</label><select id="role" name="role"><option value="user">Nutzer</option><option value="admin">Administrator</option></select></div>
            {error && !deleteTarget && <p className="form-message error" role="alert">{error}</p>}
            {message && <p className="form-message" role="status">{message}</p>}
            <button className="button button-primary" type="submit" disabled={inviting}>{inviting ? "Einladung wird versendet …" : "Einladung senden"}</button>
          </form>
        </section>

        <section className="portal-card full table-card">
          <span className="card-label-app">{users.length} Konten</span>
          <h2>Nutzerkonten</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nutzer</th><th>Rolle</th><th>Status</th><th>Seit</th><th>Aktionen</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.displayName}</strong><br /><small>{user.email}</small></td>
                    <td>{user.role}</td>
                    <td><span className={`badge ${user.isActive ? "success" : "warning"}`}>{user.isActive ? "Aktiv" : "Gesperrt"}</span></td>
                    <td>{new Intl.DateTimeFormat("de-DE").format(new Date(user.createdAt))}</td>
                    <td>
                      <div className="admin-user-actions">
                        <button className="button button-small button-table" type="button" onClick={() => toggle(user)}>{user.isActive ? "Sperren" : "Reaktivieren"}</button>
                        {user.id !== currentUserId && <button className="button button-small button-danger" type="button" onClick={() => openDeleteDialog(user)}>Löschen</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {deleteTarget && (
        <div className="admin-delete-backdrop">
          <section className="admin-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-description" aria-busy={deleting}>
            <span className="card-label-app">Endgültige Löschung</span>
            <h2 id="delete-user-title">Konto wirklich löschen?</h2>
            <p id="delete-user-description">
              Das Auth-Konto <strong>{deleteTarget.email}</strong> und sämtliche zugehörigen Profile,
              Rollen, Sessions, Bewertungen und Lernfortschritte werden dauerhaft gelöscht. Dieser
              Datenverlust kann nicht rückgängig gemacht werden.
            </p>
            <div className="field">
              <label htmlFor="delete-confirmation-email">Zur Bestätigung die exakte E-Mail-Adresse eingeben</label>
              <input id="delete-confirmation-email" type="email" value={confirmationEmail} onChange={(event) => setConfirmationEmail(event.target.value)} autoFocus autoComplete="off" disabled={deleting} />
            </div>
            {error && <p className="form-message error" role="alert">{error}</p>}
            <div className="admin-delete-actions">
              <button className="button button-secondary" type="button" disabled={deleting} onClick={() => { setDeleteTarget(null); setError(null); }}>Abbrechen</button>
              <button className="button button-danger" type="button" disabled={deleting || confirmationEmail !== deleteTarget.email} onClick={deleteUser}>
                {deleting ? "Konto wird gelöscht …" : "Konto endgültig löschen"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
