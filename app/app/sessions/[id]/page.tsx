import { notFound } from "next/navigation";
import Link from "next/link";
import { DeleteSessionButton } from "@/components/delete-session-button";
import { PortalHeading } from "@/components/portal-heading";
import { requirePageUser } from "@/lib/auth";
import {
  analyzeTranscriptPhases,
  type TranscriptPhase,
} from "@/lib/coaching/transcript-phases";
import {
  hasCompleteImprovement,
  selectSessionImprovements,
} from "@/lib/coaching/evaluation-integrity";
import { formatAppDate, formatAppTime } from "@/lib/date-time";
import { createClient } from "@/lib/supabase/server";

type Turn = { role?: string; message?: string };
type ScoreTone = "neutral" | "low" | "medium" | "high";

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

const transcriptSectionLabel: Record<TranscriptPhase, string> = {
  coach_intro: "Coach-Start",
  roleplay: "Rollenspiel",
  coach_debrief: "Coach-Auswertung",
};

function agentLabel(phase: TranscriptPhase) {
  return phase === "roleplay" ? "Ossi / Kundenrolle" : "Ossi / Coach";
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
  let sessionQuery = supabase
    .from("coaching_sessions")
    .select("id,user_id,title,status,summary,strengths,next_learning_goal,transcript,transcript_deleted_at,created_at,completed_at,duration_seconds,processing_error,scenario_snapshot")
    .eq("id", id);
  if (user.role !== "admin") sessionQuery = sessionQuery.eq("user_id", user.id);
  const { data: session } = await sessionQuery.maybeSingle();
  if (!session) notFound();
  const [{ data: evaluations }, { data: learning }] = await Promise.all([
    supabase.from("session_evaluations").select("score,reasoning,evidence,recommendation,alternative_formulation,improvement_evidence,improvement_priority,criterion:evaluation_criteria(id,name,sort_order)").eq("session_id", id),
    supabase.from("learning_profiles").select("next_learning_goal").eq("source_session_id", id).eq("user_id", session.user_id).limit(1).maybeSingle(),
  ]);
  const transcript = Array.isArray(session.transcript) ? session.transcript as Turn[] : [];
  const transcriptPhases = analyzeTranscriptPhases(transcript);
  const sortedEvaluations = [...(evaluations ?? [])].sort((a, b) => { const ac = Array.isArray(a.criterion) ? a.criterion[0] : a.criterion; const bc = Array.isArray(b.criterion) ? b.criterion[0] : b.criterion; return Number(ac?.sort_order) - Number(bc?.sort_order); });
  const improvements = selectSessionImprovements(sortedEvaluations);
  const sessionStrengths = Array.isArray(session.strengths)
    ? session.strengths.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
    : [];
  const nextLearningGoal = session.next_learning_goal
    || learning?.next_learning_goal
    || "Wird nach der Auswertung festgelegt.";
  const sessionDate = formatAppDate(session.created_at, "long");
  const sessionTime = formatAppTime(session.created_at);

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

        <section className="portal-card full coaching-conclusion-card">
          <span className="card-label-app">Dein Coaching-Fazit</span>
          <h2>Das nimmst du aus der Session mit</h2>
          <div className="coaching-conclusion-grid">
            <div className="coaching-conclusion-section conclusion-summary">
              <span>1 · Kurzfazit</span>
              <p>{session.summary || "Noch keine Zusammenfassung verfügbar."}</p>
            </div>
            <div className="coaching-conclusion-section conclusion-strengths">
              <span>2 · Beobachtete Stärken</span>
              {sessionStrengths.length ? (
                <ul>
                  {sessionStrengths.map((strength) => <li key={strength}>{strength}</li>)}
                </ul>
              ) : (
                <p>Noch keine sitzungsbezogenen Stärken gespeichert.</p>
              )}
            </div>
            <div className="coaching-conclusion-section conclusion-improvements">
              <span>3 · Die wichtigsten Verbesserungshebel</span>
              {improvements.length ? (
                <ol>
                  {improvements.map((item) => {
                    const criterion = Array.isArray(item.criterion) ? item.criterion[0] : item.criterion;
                    return (
                      <li key={criterion?.id ?? item.recommendation}>
                        <a href={`#evaluation-category-${criterion?.sort_order}`}>
                          <strong>{criterion?.name || "Kriterium"}</strong>
                          <span>{item.recommendation}</span>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p>Kein ausreichend belegter wichtiger Verbesserungshebel.</p>
              )}
            </div>
            <div className="coaching-conclusion-section conclusion-goal">
              <span>4 · Nächstes Lernziel</span>
              <p><strong>{nextLearningGoal}</strong></p>
              <Link href="/app/training?mode=focus">Dieses Ziel trainieren →</Link>
            </div>
          </div>
        </section>

        <section className="portal-card full evaluation-card">
          <span className="card-label-app">Sechs Kompetenzfelder</span>
          <h2>Bewertungen</h2>
          {sortedEvaluations.length ? (
              <div className="score-grid">
                {sortedEvaluations.map((item, index) => {
                  const criterion = Array.isArray(item.criterion)
                    ? item.criterion[0]
                    : item.criterion;
                  const name = criterion?.name || "Kriterium";
                  const reasoning = item.reasoning?.trim();
                  const evidence = item.evidence?.trim();
                  const hasImprovement = hasCompleteImprovement(item);
                  const presentation = scorePresentation(item.score);

                  return (
                    <article
                      className={`score-card score-${presentation.tone}`}
                      key={criterion?.name ?? index}
                      id={`evaluation-category-${criterion?.sort_order ?? index + 1}`}
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
                        {reasoning
                          ? reasoning
                          : item.score === null
                            ? "Nicht ausreichend bewertbar."
                            : "Bewertung aus der Gesprächsanalyse."}
                      </p>
                      {evidence && (
                        <small><strong>Beleg</strong>{evidence}</small>
                      )}
                      {hasImprovement && (
                        <div className="category-improvement">
                          <div className="category-improvement-heading">
                            <strong>Verbesserung</strong>
                            <span>{item.improvement_priority ? `Hebel ${item.improvement_priority}` : "Kategorie-Hinweis"}</span>
                          </div>
                          <p>{item.recommendation}</p>
                          <blockquote>
                            <span>Alternative</span>
                            {item.alternative_formulation}
                          </blockquote>
                          <small><strong>Beleg</strong>{item.improvement_evidence}</small>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
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
                {transcriptPhases.status !== "recognized" && (
                  <p className="transcript-phase-warning">
                    {transcriptPhases.status === "partial"
                      ? "Nur vollständig abgeschlossene, eindeutige Rollenspielabschnitte werden ausgewertet. Weitere Abschnitte sind unvollständig oder widersprüchlich markiert."
                      : "Die Rollenspielgrenzen dieses Transkripts sind nicht eindeutig erkennbar."}
                  </p>
                )}
                {transcriptPhases.segments.map((segment, index, segments) => {
                  const showDivider = index === 0 || segments[index - 1].phase !== segment.phase;
                  return (
                    <div className="transcript-segment" key={`${segment.turnIndex}-${segment.phase}-${index}`}>
                      {showDivider && (
                        <div className={`transcript-phase-divider ${segment.phase}`} role="separator">
                          <span>{transcriptSectionLabel[segment.phase]}</span>
                        </div>
                      )}
                      <div className={`transcript-turn ${segment.role}`}>
                        <strong>
                          {segment.role === "user" ? "Du" : agentLabel(segment.phase)}
                        </strong>
                        {visibleTranscriptText(segment.message)}
                      </div>
                    </div>
                  );
                })}
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
          {session.user_id === user.id
            ? <DeleteSessionButton id={session.id} />
            : <p className="form-message">Administrativer Nur-Lese-Zugriff</p>}
        </section>
      </div>
    </>
  );
}
