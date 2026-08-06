import Link from "next/link";
import { PortalHeading } from "@/components/portal-heading";
import { requirePageUser } from "@/lib/auth";
import { formatAppDateTime } from "@/lib/date-time";
import { createAdminClient } from "@/lib/supabase/admin";

const statusLabel: Record<string, string> = { created: "Vorbereitet", active: "Aktiv", processing: "Auswertung", completed: "Abgeschlossen", failed: "Fehlgeschlagen" };

export default async function AdminSessionsPage() {
  await requirePageUser({ admin: true });
  const supabase = createAdminClient();
  const [{ data: sessions }, { data: authData }] = await Promise.all([
    supabase.from("coaching_sessions").select("id,user_id,title,status,created_at,duration_seconds,summary").order("created_at", { ascending: false }).limit(200),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const userIds = [...new Set((sessions ?? []).map((session) => session.user_id))];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id,display_name").in("id", userIds) : { data: [] };
  const authNames = new Map((authData?.users ?? []).map((user) => [user.id, user.email?.split("@")[0] || "Nutzer"]));
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name || authNames.get(profile.id) || "Nutzer"]));
  return <><PortalHeading eyebrow="Administration" title="Alle Sessions" description="Transkripte und Bewertungen sind einsehbar, aber nicht editierbar." /><section className="portal-card full table-card"><span className="card-label-app">{sessions?.length ?? 0} Sessions</span><h2>Session-Verlauf</h2><div className="table-wrap"><table><thead><tr><th>Nutzer</th><th>Session</th><th>Status</th><th>Datum</th><th>Dauer</th></tr></thead><tbody>{(sessions ?? []).map((session) => <tr key={session.id}><td>{names.get(session.user_id) || authNames.get(session.user_id) || "Nutzer"}</td><td><Link href={`/app/sessions/${session.id}`}>{session.title || "Voice-Coaching"}</Link><br /><small>{session.summary?.slice(0, 100)}</small></td><td><span className={`badge ${session.status === "completed" ? "success" : session.status === "failed" ? "warning" : ""}`}>{statusLabel[session.status] || session.status}</span></td><td>{formatAppDateTime(session.created_at)}</td><td>{session.duration_seconds ? `${Math.round(session.duration_seconds / 60)} Min.` : "–"}</td></tr>)}</tbody></table></div></section></>;
}
