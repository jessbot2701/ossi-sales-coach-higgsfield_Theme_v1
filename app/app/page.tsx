import Link from "next/link";
import { PortalHeading } from "@/components/portal-heading";
import { requirePageUser } from "@/lib/auth";
import { buildCoachingResume } from "@/lib/coaching/resume";
import { createClient } from "@/lib/supabase/server";

const statusLabel: Record<string, string> = { created: "Vorbereitet", active: "Aktiv", processing: "Auswertung", completed: "Abgeschlossen", failed: "Fehlgeschlagen" };
const trendLabel: Record<string, string> = { up: "aufwärts", stable: "stabil", down: "abwärts", insufficient_data: "noch offen" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  const supabase = await createClient();
  const [{ data: sessions }, { data: progress }, { data: learning }, { count: completedCount }] = await Promise.all([
    supabase.from("coaching_sessions").select("id,title,status,summary,created_at,duration_seconds").order("created_at", { ascending: false }).limit(6),
    supabase.from("user_competency_progress").select("average_score,latest_score,trend,session_count,competency:competencies(name)").order("average_score", { ascending: false }),
    supabase.from("learning_profiles").select("strengths,focus_areas,next_learning_goal").is("training_type_id", null).maybeSingle(),
    supabase.from("coaching_sessions").select("id", { count: "exact", head: true }).eq("status", "completed"),
  ]);
  const completed = completedCount ?? 0;
  const averages = (progress ?? []).map((item) => Number(item.average_score)).filter(Number.isFinite);
  const average = averages.length ? (averages.reduce((sum, item) => sum + item, 0) / averages.length).toFixed(1) : "–";
  const coachingResume = buildCoachingResume({ completedSessionCount: completed, strengths: learning?.strengths, focusAreas: learning?.focus_areas });
  return (
    <>
      <PortalHeading
        eyebrow="Persönliches Dashboard"
        title={<>Hallo {user.displayName.split(" ")[0]}.</>}
        description="Ossi begleitet deine Entwicklung und empfiehlt dir den passenden nächsten Schritt."
      />
      <div className="portal-grid dashboard-grid">
        <section className="portal-card full coaching-resume"><p className="eyebrow"><span /> Ossi kennt deinen Weg</p><h2>Kurzer Rückblick</h2><p>{coachingResume}</p><div className="coaching-actions"><Link className="button button-primary" href="/app/training?mode=surprise">Ossi überrascht mich</Link><Link className="button button-secondary" href="/app/training?mode=focus">Gezielt trainieren</Link></div></section>
        <section className="portal-card third metric-card"><span className="card-label-app">Sessions</span><div className="metric">{completed}</div><p>abgeschlossen</p></section>
        <section className="portal-card third metric-card"><span className="card-label-app">Ø Kompetenz</span><div className="metric">{average}</div><p>von 5 Punkten</p></section>
        <section className="portal-card third action-card"><span className="card-label-app">Nächster Schritt</span><h2>Weiter trainieren</h2><Link className="button button-primary" href="/app/training">Training starten</Link></section>
        <section className="portal-card insight-card"><h2>Stärken</h2>{Array.isArray(learning?.strengths) && learning.strengths.length ? <ul>{learning.strengths.map((item) => <li key={String(item)}>{String(item)}</li>)}</ul> : <p>Noch nicht genügend Bewertungen.</p>}</section>
        <section className="portal-card insight-card focus-card"><h2>Fokusfelder</h2>{Array.isArray(learning?.focus_areas) && learning.focus_areas.length ? <ul>{learning.focus_areas.map((item) => <li key={String(item)}>{String(item)}</li>)}</ul> : <p>Werden nach deiner ersten Session berechnet.</p>}</section>
        <section className="portal-card full list-card"><h2>Letzte Sessions</h2>{sessions?.length ? <ul className="data-list">{sessions.map((session) => <li className="data-row" key={session.id}><div><Link href={`/app/sessions/${session.id}`}>{session.title || "Voice-Coaching"}</Link><br /><small>{new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.created_at))}{session.summary ? ` · ${session.summary.slice(0, 110)}` : ""}</small></div><span className={`badge ${session.status === "completed" ? "success" : session.status === "failed" ? "warning" : ""}`}>{statusLabel[session.status] || session.status}</span></li>)}</ul> : <div className="empty-state">Noch keine Sessions. Ossi wartet schon.</div>}</section>
        {!!progress?.length && <section className="portal-card full progress-card"><h2>Kompetenzentwicklung</h2><div className="score-grid">{progress.map((item, index) => { const competency = Array.isArray(item.competency) ? item.competency[0] : item.competency; return <div className="score-card" key={index}><strong>{competency?.name || "Kompetenz"}</strong><div className="score-value">{Number(item.average_score).toFixed(1)}</div><small>{item.session_count} Bewertungen · Trend {trendLabel[item.trend] || "noch offen"}</small></div>; })}</div></section>}
      </div>
    </>
  );
}
