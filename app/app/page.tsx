import Link from "next/link";
import { OssiPortrait } from "@/components/ossi-portrait";
import { requirePageUser } from "@/lib/auth";
import { STRENGTH_MIN_AVERAGE_SCORE, STRENGTH_MIN_RATINGS } from "@/lib/coaching/progress";
import { buildCoachingResume } from "@/lib/coaching/resume";
import { formatAppDateTime } from "@/lib/date-time";
import { createClient } from "@/lib/supabase/server";

const statusLabel: Record<string, string> = { created: "Vorbereitet", active: "Aktiv", processing: "Auswertung", completed: "Abgeschlossen", failed: "Fehlgeschlagen" };
const trendLabel: Record<string, string> = { up: "aufwärts", stable: "stabil", down: "abwärts", insufficient_data: "noch offen" };
const competencyOrder: Record<string, number> = { opening: 1, questioning: 2, value: 3, objections: 4, closing: 5, language: 6 };

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function scorePresentation(score: number) {
  if (score < 2.5) return { label: "Ausbaufähig", tone: "low" };
  if (score < 4) return { label: "Solide", tone: "medium" };
  return { label: "Stark", tone: "high" };
}

function scoreExplanation(score: number) {
  if (score <= 1) return "Die Fähigkeit war in dieser Session nicht erkennbar oder wirkte kontraproduktiv.";
  if (score === 2) return "Die Fähigkeit war erkennbar, ist aber noch deutlich verbesserungsbedürftig.";
  if (score === 3) return "Die Auswertung sieht eine solide Grundlage mit erkennbarem Entwicklungspotenzial.";
  if (score === 4) return "Die Fähigkeit wurde in dieser Session als überzeugend bewertet.";
  return "Die Fähigkeit wurde in dieser Session als vorbildlich bewertet.";
}

function isEvaluationReasoning(value: string | null | undefined) {
  if (!value?.trim()) return false;
  if (/\b(ich bin Ossi|heute trainieren wir|bist du bereit)\b/i.test(value)) return false;
  return /\b(du|dein[a-zäöüß]*|wirkt|gelungen|klar|unklar|verbesser[a-zäöüß]*|überzeug[a-zäöüß]*|fehl[a-zäöüß]*|stark|solide|präzise|relevan[a-zäöüß]*|konkret[a-zäöüß]*|anlass|nutzen|verwechselt)\b/i.test(value);
}

export default async function DashboardPage() {
  const user = await requirePageUser();
  const supabase = await createClient();
  const [{ data: sessions }, { data: progress }, { data: learning }, { count: completedCount }, { data: competencies }, { data: recentEvaluations }] = await Promise.all([
    supabase.from("coaching_sessions").select("id,title,status,summary,created_at,duration_seconds").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("user_competency_progress").select("competency_id,average_score,latest_score,trend,session_count").eq("user_id", user.id),
    supabase.from("learning_profiles").select("strengths,focus_areas,next_learning_goal").eq("user_id", user.id).is("training_type_id", null).maybeSingle(),
    supabase.from("coaching_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed"),
    supabase.from("competencies").select("id,name,slug"),
    supabase
      .from("session_evaluations")
      .select("score,reasoning,evidence,created_at,criterion:evaluation_criteria(competency_id,competency:competencies(id,name,slug)),session:coaching_sessions!inner(id,title,completed_at,user_id)")
      .eq("session.user_id", user.id)
      .not("score", "is", null)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const completed = completedCount ?? 0;
  const progressByCompetency = new Map((progress ?? []).map((item) => [item.competency_id, item]));
  const competencyRows = [...(competencies ?? [])]
    .sort((a, b) => (competencyOrder[a.slug] ?? 99) - (competencyOrder[b.slug] ?? 99))
    .map((competency) => ({ competency, progress: progressByCompetency.get(competency.id) }));
  const averages = (progress ?? []).map((item) => Number(item.average_score)).filter(Number.isFinite);
  const average = averages.length ? (averages.reduce((sum, item) => sum + item, 0) / averages.length).toFixed(1) : "–";
  const ratedCompetencyCount = competencyRows.filter(({ progress: item }) => Boolean(item)).length;
  const coachingResume = buildCoachingResume({ completedSessionCount: completed, strengths: learning?.strengths, focusAreas: learning?.focus_areas });
  const stableStrengths = new Set((Array.isArray(learning?.strengths) ? learning.strengths : []).map(String));
  const focusAreas = new Set((Array.isArray(learning?.focus_areas) ? learning.focus_areas : []).map(String));
  const latestEvaluationByCompetency = new Map<string, NonNullable<typeof recentEvaluations>[number]>();
  const sessionReasoningFrequency = new Map<string, number>();
  const sessionEvidenceFrequency = new Map<string, number>();

  for (const evaluation of recentEvaluations ?? []) {
    const criterion = one(evaluation.criterion);
    const competency = criterion ? one(criterion.competency) : null;
    const session = one(evaluation.session);
    const reasoning = evaluation.reasoning?.trim();
    if (session?.id && reasoning) {
      const key = `${session.id}\u0000${reasoning}`;
      sessionReasoningFrequency.set(key, (sessionReasoningFrequency.get(key) ?? 0) + 1);
    }
    const evidence = evaluation.evidence?.trim();
    if (session?.id && evidence) {
      const key = `${session.id}\u0000${evidence}`;
      sessionEvidenceFrequency.set(key, (sessionEvidenceFrequency.get(key) ?? 0) + 1);
    }
    if (competency?.id && !latestEvaluationByCompetency.has(competency.id)) {
      latestEvaluationByCompetency.set(competency.id, evaluation);
    }
  }

  return (
    <>
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="dashboard-hero-copy">
          <p className="eyebrow"><span /> Dein persönlicher Coach</p>
          <h1 id="dashboard-title">Hallo {user.displayName.split(" ")[0]}.</h1>
          <p className="dashboard-hero-lead">{coachingResume}</p>
          <div className="dashboard-hero-actions">
            <Link className="button button-primary" href="/app/training?mode=surprise">Ossi überrascht mich</Link>
            <Link className="button button-secondary" href="/app/training?mode=focus">Gezielt trainieren</Link>
          </div>
        </div>

        <div className="dashboard-next-step">
          <span>Dein nächster Schritt</span>
          <strong>{learning?.next_learning_goal || "Eine weitere Session schafft die Grundlage für dein nächstes Lernziel."}</strong>
          <Link href="/app/training?mode=focus">Diesen Fokus trainieren <span aria-hidden="true">→</span></Link>
        </div>

        <div className="dashboard-hero-portrait" aria-hidden="true">
          <OssiPortrait variant="heading" decorative />
        </div>
      </section>

      <div className="portal-grid dashboard-grid">
        <section className="dashboard-overview" aria-label="Trainingsüberblick">
          <article className="overview-metric">
            <span>Sessions</span>
            <div><strong>{completed}</strong><small>abgeschlossen</small></div>
            <p>Jedes Gespräch schärft dein persönliches Coaching-Profil.</p>
          </article>
          <article className="overview-metric overview-score">
            <span>Kompetenzschnitt</span>
            <div><strong>{average}</strong><small>von 5</small></div>
            <p>Durchschnitt über deine aktuell bewertbaren Kompetenzfelder.</p>
          </article>
          <article className="overview-metric">
            <span>Beobachtete Felder</span>
            <div><strong>{ratedCompetencyCount}</strong><small>von {competencyRows.length || 6}</small></div>
            <p>Nur konkrete Gesprächsmomente fließen in die Bewertung ein.</p>
          </article>
        </section>

        <section className="dashboard-competencies full">
          <div className="cockpit-heading">
            <div>
              <span className="card-label-app">Nachvollziehbare Entwicklung</span>
              <h2>Deine sechs Kompetenzen</h2>
              <p>Große Werte zeigen deinen bisherigen Durchschnitt. Über „Bewertung verstehen“ findest du die letzte Begründung und den konkreten Gesprächsbeleg.</p>
            </div>
            <div className="strength-rule">
              <span>Wann wird etwas zur Stärke?</span>
              <strong>{STRENGTH_MIN_RATINGS} Bewertungen · Ø {STRENGTH_MIN_AVERAGE_SCORE.toFixed(1)}</strong>
            </div>
          </div>

          {competencyRows.length ? (
            <div className="competency-list">
              {competencyRows.map(({ competency, progress: item }, index) => {
                const competencyName = competency.name || "Kompetenz";
                if (!item) {
                  return (
                    <article className="competency-card unrated" key={competency.id ?? index}>
                      <header className="competency-card-head">
                        <span className="competency-number">{String(index + 1).padStart(2, "0")}</span>
                        <span className="competency-state neutral">Noch offen</span>
                      </header>
                      <h3>{competencyName}</h3>
                      <div className="competency-score-area">
                        <div className="competency-score-ring" aria-label={`${competencyName}: noch nicht bewertet`}>
                          <svg viewBox="0 0 120 120" aria-hidden="true">
                            <circle className="score-ring-track" cx="60" cy="60" r="52" />
                          </svg>
                        </div>
                        <div className="competency-score-summary">
                          <div className="competency-score-value"><strong>–</strong><span>/ 5</span></div>
                          <p><strong>Nicht bewertet</strong><span>Diese Kompetenz war bisher noch nicht ausreichend beobachtbar.</span></p>
                        </div>
                      </div>
                      <div className="competency-card-meta"><span>0 verwertbare Bewertungen</span></div>
                    </article>
                  );
                }

                const averageScore = Number(item.average_score);
                const latestScore = Number(item.latest_score);
                const sessionCount = Number(item.session_count);
                const latestEvaluation = latestEvaluationByCompetency.get(competency.id);
                const latestSession = latestEvaluation ? one(latestEvaluation.session) : null;
                const latestReasoning = latestEvaluation?.reasoning?.trim();
                const reasoningKey = latestSession?.id && latestReasoning ? `${latestSession.id}\u0000${latestReasoning}` : null;
                const latestEvidence = latestEvaluation?.evidence?.trim();
                const evidenceKey = latestSession?.id && latestEvidence ? `${latestSession.id}\u0000${latestEvidence}` : null;
                const hasSpecificReasoning = !!reasoningKey && sessionReasoningFrequency.get(reasoningKey) === 1 && isEvaluationReasoning(latestReasoning);
                const hasSpecificEvidence = !!evidenceKey && sessionEvidenceFrequency.get(evidenceKey) === 1;
                const presentation = scorePresentation(averageScore);
                const state = stableStrengths.has(competencyName)
                  ? { label: "Stärke", tone: "strength" }
                  : focusAreas.has(competencyName)
                    ? { label: "Fokus", tone: "focus" }
                    : averageScore >= STRENGTH_MIN_AVERAGE_SCORE && sessionCount < STRENGTH_MIN_RATINGS
                      ? { label: "Im Aufbau", tone: "building" }
                      : { label: "Beobachtung", tone: "neutral" };

                return (
                  <article className={`competency-card score-${presentation.tone}`} key={competency.id ?? index}>
                    <header className="competency-card-head">
                      <span className="competency-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className={`competency-state ${state.tone}`}>{state.label}</span>
                    </header>
                    <h3>{competencyName}</h3>
                    <div className="competency-score-area">
                      <div className="competency-score-ring" aria-label={`${competencyName}: ${averageScore.toFixed(1)} von 5 Punkten`}>
                        <svg viewBox="0 0 120 120" aria-hidden="true">
                          <circle className="score-ring-track" cx="60" cy="60" r="52" />
                          <circle
                            className={`score-ring-value ${presentation.tone}`}
                            cx="60"
                            cy="60"
                            r="52"
                            pathLength="100"
                            strokeDasharray={`${Math.max(0, Math.min(100, averageScore * 20))} 100`}
                          />
                        </svg>
                      </div>
                      <div className="competency-score-summary">
                        <div className="competency-score-value"><strong>{averageScore.toFixed(1)}</strong><span>/ 5</span></div>
                        <p><strong>{presentation.label}</strong><span>Dein bisheriger Durchschnitt in diesem Kompetenzfeld.</span></p>
                      </div>
                    </div>
                    <div className="competency-card-meta">
                      <span>{sessionCount} verwertbare {sessionCount === 1 ? "Bewertung" : "Bewertungen"}</span>
                      <span>Letzte Bewertung {latestScore.toFixed(1)}</span>
                      <span>Trend: {trendLabel[item.trend] || "noch offen"}</span>
                    </div>

                    {latestEvaluation ? (
                      <details className="competency-explanation">
                        <summary>Bewertung verstehen</summary>
                        <div className="competency-explanation-body">
                          <div className="explanation-score">
                            <span>Letzte Session</span>
                            <strong>{Number(latestEvaluation.score).toFixed(0)}/5</strong>
                          </div>
                          <div className="explanation-copy">
                            <span>Einordnung</span>
                            <p>{hasSpecificReasoning ? latestReasoning : scoreExplanation(Number(latestEvaluation.score))}</p>
                          </div>
                          {hasSpecificEvidence && (
                            <blockquote>
                              <span>Beobachteter Gesprächsmoment</span>
                              {latestEvidence}
                            </blockquote>
                          )}
                          {!hasSpecificReasoning && !hasSpecificEvidence && (
                            <p className="explanation-missing">Diese ältere Bewertung enthält nur ein allgemeines Coaching-Fazit. Es wird nicht einer einzelnen Kompetenz zugeschrieben.</p>
                          )}
                          {latestSession?.id && (
                            <Link href={`/app/sessions/${latestSession.id}`}>
                              {latestSession.title || "Vollständige Session ansehen"} →
                            </Link>
                          )}
                        </div>
                      </details>
                    ) : (
                      <small className="explanation-missing">Zur letzten Bewertung ist noch kein Gesprächsbeleg gespeichert.</small>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">Noch keine verwertbaren Kompetenzbewertungen. Sehr kurze Sessions können unbewertet bleiben.</div>
          )}
        </section>

        <section className="dashboard-history full">
          <header className="history-heading">
            <div>
              <span className="card-label-app">Dein Verlauf</span>
              <h2>Letzte Sessions</h2>
            </div>
            <Link href="/app/training">Neues Training <span aria-hidden="true">→</span></Link>
          </header>
          {sessions?.length ? (
            <ol className="session-timeline">
              {sessions.map((session, index) => (
                <li key={session.id}>
                  <div className="timeline-marker"><span>{String(index + 1).padStart(2, "0")}</span></div>
                  <div className="timeline-content">
                    <time dateTime={session.created_at}>
                      {formatAppDateTime(session.created_at)}
                    </time>
                    <Link href={`/app/sessions/${session.id}`}>{session.title || "Voice-Coaching"}</Link>
                    {session.summary && <p>{session.summary.slice(0, 180)}</p>}
                  </div>
                  <span className={`badge ${session.status === "completed" ? "success" : session.status === "failed" ? "warning" : ""}`}>{statusLabel[session.status] || session.status}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">Noch keine Sessions. Ossi wartet schon.</div>
          )}
        </section>
      </div>
    </>
  );
}
