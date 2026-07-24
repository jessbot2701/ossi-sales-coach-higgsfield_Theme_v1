import { notFound } from "next/navigation";
import Link from "next/link";
import { DeleteSessionButton } from "@/components/delete-session-button";
import { PortalHeading } from "@/components/portal-heading";
import { requirePageUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Turn = { role?: string; message?: string };
type ScoreTone = "neutral" | "low" | "medium" | "high";

const SESSION_TIME_ZONE = "Europe/Berlin";
const statusLabel: Record<string, string> = {
  created: "Vorbereitet",
  active: "Aktiv",
  processing: "Auswertung",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
};

function visibleTranscriptText(message?: string) {
  return (message ?? "").replace(/<\/?(?:Christian|Susanne|Helmut)>/g, "").replace(/\s+/g, " ").trim();
}

function agentLabel(message?: string) {
  return message?.includes("<Helmut>") ? "Ossi / Coach" : "Ossi / Rolle";
}

function scorePresentation(score: number | null): { label: string; tone: ScoreTone } {
  if (score === null) return { label: "Nicht bewertet", tone: "neutral" };
  if (score <= 2) return { label: "Ausbaufähig", tone: "low" };
  if (score === 3) return { label: "Solide", tone: "medium" };
  return { label: "Stark", tone: "high" };
}

function durationLabel(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "Nicht erfasst";
  if (seconds < 60) return "Unter 1 Minute";
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "Minute" : "Minuten"}`;
}

function SessionScoreRing({
  name,
  score,
  tone,
}: {
  name: string;
  score: number | null;
  tone: ScoreTone;
}) {
  const scorePercent = score === null
    ? 0
    : Math.max(0, Math.min(100, score * 20));

  return (
    <div
      className={`session-score-ring${score === null ? " unrated" : ""}`}
      aria-label={`${name}: ${score === null ? "nicht bewertet" : `${score} von 5 Punkten`}`}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="score-ring-track" cx="60" cy="60" r="52" />
        {score !== null && (
          <circle
            className={`score-ring-value ${tone}`}
            cx="60"
            cy="60"
            r="52"
            pathLength="100"
            strokeDasharray={`${scorePercent} 100`}
          />
        )}
      </svg>
    </div>
  );
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser();
  const supabase = await createClient();
  const { data: session } = await supabase.from("coaching_sessions").select("id,title,status,summary,transcript,transcript_deleted_at,created_at,completed_at,duration_seconds,processing_error,scenario_snapshot").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!session) notFound();
  const [{ data: evaluations }, { data: learning }] = await Promise.all([
    supabase.from("session_evaluations").select("score,reasoning,evidence,recommendation,criterion:evaluation_criteria(name,sort_order)").eq("session_id", id),
    supabase.from("learning_profiles").select("next_learning_goal").eq("source_session_id", id).eq("user_id", user.id).limit(1).maybeSingle(),
  ]);
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
  const sessionStartedAt = new Date(session.created_at);
  const sessionDate = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "long",
    timeZone: SESSION_TIME_ZONE,
  }).format(sessionStartedAt);
  const sessionTime = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SESSION_TIME_ZONE,
  }).format(sessionStartedAt);

  return (
    <>
      <PortalHeading
        eyebrow="Session-Auswertung"
        title={session.title || "Voice-Coaching"}
        description="Deine Session mit Kompetenzwerten, Gesprächsbelegen und dem nächsten Lernziel."
        portraitVariant="session"
        actions={(
          <div className="page-actions">
            <Link className="button button-secondary" href="/app">Zum Dashboard</Link>
            <Link className="button button-primary" href="/app/training">Neues Training</Link>
          </div>
        )}
      />

      <div className="portal-grid session-results">
        <section
          className="portal-card full session-meta-card"
          aria-label="Zeitpunkt und Dauer der Session"
        >
          <div className="session-primary-fact">
            <span>Session am</span>
            <strong>{sessionDate}</strong>
          </div>
          <div className="session-fact">
            <span>Startzeit</span>
            <strong>{sessionTime} Uhr</strong>
          </div>
          <div className="session-fact">
            <span>Dauer</span>
            <strong>{durationLabel(session.duration_seconds)}</strong>
          </div>
          <span className={`badge ${session.status === "completed" ? "success" : session.status === "failed" ? "warning" : ""}`}>
            {statusLabel[session.status] || session.status}
          </span>
        </section>

        {session.status !== "completed" && (
          <section className="portal-card full">
            <h2>Status: {statusLabel[session.status] || session.status}</h2>
            <p>
              {session.status === "processing" || session.status === "active"
                ? "Das Gespräch wird noch ausgewertet. Lade die Seite in wenigen Augenblicken neu."
                : session.processing_error || "Die Session ist noch nicht abgeschlossen."}
            </p>
          </section>
        )}

        <section className="portal-card summary-card">
          <span className="card-label-app">Gespräch in Kürze</span>
          <h2>Zusammenfassung</h2>
          <p>{session.summary || "Noch keine Zusammenfassung verfügbar."}</p>
        </section>

        <section className="portal-card learning-goal-card">
          <span className="card-label-app">Dein nächster Schritt</span>
          <h2>Nächstes Lernziel</h2>
          <p>
            <strong>
              {learning?.next_learning_goal
                || sortedEvaluations.find((item) => item.recommendation)?.recommendation
                || "Wird nach der Auswertung festgelegt."}
            </strong>
          </p>
          <Link href="/app/training?mode=focus">Dieses Ziel trainieren →</Link>
        </section>

        <section className="portal-card full evaluation-card">
          <span className="card-label-app">Sechs Kompetenzfelder</span>
          <h2>Bewertungen</h2>
          {sortedEvaluations.length ? (
            <>
              {(repeatedReasoning.size > 0 || repeatedEvidence.size > 0) && (
                <div className="evaluation-shared">
                  <strong>Coaching-Fazit</strong>
                  {[...repeatedReasoning].map((text) => <p key={text}>{text}</p>)}
                  {[...repeatedEvidence].map((text) => <small key={text}>Beleg: {text}</small>)}
                </div>
              )}
              <div className="score-grid">
                {sortedEvaluations.map((item, index) => {
                  const criterion = Array.isArray(item.criterion)
                    ? item.criterion[0]
                    : item.criterion;
                  const name = criterion?.name || "Kriterium";
                  const reasoning = item.reasoning?.trim();
                  const evidence = item.evidence?.trim();
                  const presentation = scorePresentation(item.score);

                  return (
                    <article
                      className={`score-card score-${presentation.tone}`}
                      key={criterion?.name ?? index}
                    >
                      <div className="session-score-overview">
                        <SessionScoreRing
                          name={name}
                          score={item.score}
                          tone={presentation.tone}
                        />
                        <div className="session-score-copy">
                          <strong>{name}</strong>
                          <div className="session-score-value">
                            <strong>{item.score === null ? "–" : item.score}</strong>
                            <span>/ 5</span>
                          </div>
                          <span className={`score-pill ${presentation.tone}`}>
                            {presentation.label}
                          </span>
                        </div>
                      </div>
                      <p>
                        {reasoning && !repeatedReasoning.has(reasoning)
                          ? reasoning
                          : item.score === null
                            ? "Nicht ausreichend bewertbar."
                            : "Bewertung aus der Gesprächsanalyse."}
                      </p>
                      {evidence && !repeatedEvidence.has(evidence) && (
                        <small><strong>Beleg</strong>{evidence}</small>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state">Noch keine Bewertungen verfügbar.</div>
          )}
        </section>

        <section className="portal-card full transcript-card">
          <span className="card-label-app">Gesprächsverlauf</span>
          <h2>Transkript</h2>
          {session.transcript_deleted_at ? (
            <p>
              Das Transkript wurde nach Ablauf der zwölfmonatigen Aufbewahrung
              gelöscht. Zusammenfassung und Lernfortschritt bleiben erhalten.
            </p>
          ) : transcript.length ? (
            <details className="transcript-disclosure">
              <summary>Transkript anzeigen <span>{transcript.length} Beiträge</span></summary>
              <div className="transcript">
                {transcript.map((turn, index) => (
                  <div className={`transcript-turn ${turn.role}`} key={index}>
                    <strong>{turn.role === "user" ? "Du" : agentLabel(turn.message)}</strong>
                    {visibleTranscriptText(turn.message)}
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <div className="empty-state">Kein Transkript verfügbar.</div>
          )}
        </section>

        <section className="portal-card full privacy-card">
          <div>
            <span className="card-label-app">Datenkontrolle</span>
            <h2>Datenschutz</h2>
            <p>
              Du kannst diese Session inklusive Transkript, Bewertungen und
              Verknüpfungen vollständig löschen.
            </p>
          </div>
          <DeleteSessionButton id={session.id} />
        </section>
      </div>
    </>
  );
}
