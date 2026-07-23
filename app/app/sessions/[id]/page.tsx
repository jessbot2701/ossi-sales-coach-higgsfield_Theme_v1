import { notFound } from "next/navigation";
import Link from "next/link";
import { DeleteSessionButton } from "@/components/delete-session-button";
import { PortalHeading } from "@/components/portal-heading";
import { createClient } from "@/lib/supabase/server";

type Turn = { role?: string; message?: string };

function visibleTranscriptText(message?: string) {
  return (message ?? "").replace(/<\/?(?:Christian|Susanne|Helmut)>/g, "").replace(/\s+/g, " ").trim();
}

function agentLabel(message?: string) {
  return message?.includes("<Helmut>") ? "Ossi / Coach" : "Ossi / Rolle";
}

function scorePresentation(score: number | null) {
  if (score === null) return { label: "Nicht bewertet", tone: "neutral" };
  if (score <= 2) return { label: "Ausbaufähig", tone: "low" };
  if (score === 3) return { label: "Solide", tone: "medium" };
  return { label: "Stark", tone: "high" };
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase.from("coaching_sessions").select("id,title,status,summary,transcript,transcript_deleted_at,created_at,completed_at,duration_seconds,processing_error,scenario_snapshot").eq("id", id).maybeSingle();
  if (!session) notFound();
  const { data: evaluations } = await supabase.from("session_evaluations").select("score,reasoning,evidence,recommendation,criterion:evaluation_criteria(name,sort_order)").eq("session_id", id);
  const { data: learning } = await supabase.from("learning_profiles").select("next_learning_goal").eq("source_session_id", id).limit(1).maybeSingle();
  const transcript = Array.isArray(session.transcript) ? session.transcript as Turn[] : [];
  const sortedEvaluations = [...(evaluations ?? [])].sort((a, b) => { const ac = Array.isArray(a.criterion) ? a.criterion[0] : a.criterion; const bc = Array.isArray(b.criterion) ? b.criterion[0] : b.criterion; return Number(ac?.sort_order) - Number(bc?.sort_order); });
  const repeatedReasoning = new Set(sortedEvaluations.flatMap((item, index, items) => {
    const value = item.reasoning?.trim();
    return value && items.some((other, otherIndex) => otherIndex !== index && other.reasoning?.trim() === value) ? [value] : [];
  }));
  const repeatedEvidence = new Set(sortedEvaluations.flatMap((item, index, items) => {
    const value = item.evidence?.trim();
    return value && items.some((other, otherIndex) => otherIndex !== index && other.evidence?.trim() === value) ? [value] : [];
  }));
  return (
    <><PortalHeading
      eyebrow="Session-Auswertung"
      title={session.title || "Voice-Coaching"}
      description={<>{new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeStyle: "short" }).format(new Date(session.created_at))}{session.duration_seconds ? ` · ${Math.round(session.duration_seconds / 60)} Minuten` : ""}</>}
      portraitVariant="session"
      actions={<div className="page-actions"><Link className="button button-secondary" href="/app">Zum Dashboard</Link><Link className="button button-primary" href="/app/training">Neues Training</Link></div>}
    />
      <div className="portal-grid session-results">
        {session.status !== "completed" && <section className="portal-card full"><h2>Status: {session.status}</h2><p>{session.status === "processing" || session.status === "active" ? "Das Gespräch wird noch ausgewertet. Lade die Seite in wenigen Augenblicken neu." : session.processing_error || "Die Session ist noch nicht abgeschlossen."}</p></section>}
        <section className="portal-card summary-card"><span className="card-label-app">Gespräch in Kürze</span><h2>Zusammenfassung</h2><p>{session.summary || "Noch keine Zusammenfassung verfügbar."}</p></section>
        <section className="portal-card learning-goal-card"><span className="card-label-app">Dein nächster Schritt</span><h2>Nächstes Lernziel</h2><p><strong>{learning?.next_learning_goal || sortedEvaluations.find((item) => item.recommendation)?.recommendation || "Wird nach der Auswertung festgelegt."}</strong></p><Link href="/app/training?mode=focus">Dieses Ziel trainieren →</Link></section>
        <section className="portal-card full evaluation-card"><span className="card-label-app">Sechs Kompetenzfelder</span><h2>Bewertungen</h2>{sortedEvaluations.length ? <>{(repeatedReasoning.size > 0 || repeatedEvidence.size > 0) && <div className="evaluation-shared"><strong>Coaching-Fazit</strong>{[...repeatedReasoning].map((text) => <p key={text}>{text}</p>)}{[...repeatedEvidence].map((text) => <small key={text}>Beleg: {text}</small>)}</div>}<div className="score-grid">{sortedEvaluations.map((item, index) => { const criterion = Array.isArray(item.criterion) ? item.criterion[0] : item.criterion; const reasoning = item.reasoning?.trim(); const evidence = item.evidence?.trim(); const presentation = scorePresentation(item.score); return <article className={`score-card score-${presentation.tone}`} key={criterion?.name ?? index}><div className="score-card-head"><strong>{criterion?.name || "Kriterium"}</strong><span className={`score-pill ${presentation.tone}`}>{item.score === null ? "–" : `${item.score}/5`} · {presentation.label}</span></div><p>{reasoning && !repeatedReasoning.has(reasoning) ? reasoning : item.score === null ? "Nicht ausreichend bewertbar." : "Bewertung aus der Gesprächsanalyse."}</p>{evidence && !repeatedEvidence.has(evidence) && <small>Beleg: {evidence}</small>}</article>; })}</div></> : <div className="empty-state">Noch keine Bewertungen verfügbar.</div>}</section>
        <section className="portal-card full transcript-card"><span className="card-label-app">Gesprächsverlauf</span><h2>Transkript</h2>{session.transcript_deleted_at ? <p>Das Transkript wurde nach Ablauf der zwölfmonatigen Aufbewahrung gelöscht. Zusammenfassung und Lernfortschritt bleiben erhalten.</p> : transcript.length ? <details className="transcript-disclosure"><summary>Transkript anzeigen <span>{transcript.length} Beiträge</span></summary><div className="transcript">{transcript.map((turn, index) => <div className={`transcript-turn ${turn.role}`} key={index}><strong>{turn.role === "user" ? "Du" : agentLabel(turn.message)}</strong>{visibleTranscriptText(turn.message)}</div>)}</div></details> : <div className="empty-state">Kein Transkript verfügbar.</div>}</section>
        <section className="portal-card full privacy-card"><div><span className="card-label-app">Datenkontrolle</span><h2>Datenschutz</h2><p>Du kannst diese Session inklusive Transkript, Bewertungen und Verknüpfungen vollständig löschen.</p></div><DeleteSessionButton id={session.id} /></section>
      </div>
    </>
  );
}
