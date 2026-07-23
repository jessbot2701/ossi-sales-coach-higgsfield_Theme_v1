"use client";

import { ConversationProvider, useConversationControls, useConversationStatus } from "@elevenlabs/react";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { OssiPortrait } from "@/components/ossi-portrait";
import type { DynamicVariables } from "@/types/domain";

type TrainingMode = "surprise" | "focus";
type TrainingType = { id: string; name: string; description: string };
type Criterion = {
  id: string;
  training_type_id: string;
  name: string;
  description: string;
  competency: { name: string } | { name: string }[] | null;
};
type LearningProfile = { training_type_id: string | null; focus_areas: unknown; next_learning_goal: string | null };

const textList = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  : [];

function competencyName(criterion: Criterion) {
  const competency = Array.isArray(criterion.competency) ? criterion.competency[0] : criterion.competency;
  return competency?.name ?? criterion.name;
}

function recommendedCriterion(criteria: Criterion[], profiles: LearningProfile[], trainingTypeId: string) {
  const typeProfile = profiles.find((profile) => profile.training_type_id === trainingTypeId);
  const globalProfile = profiles.find((profile) => profile.training_type_id === null);
  const recommendations = [...textList(typeProfile?.focus_areas), ...textList(globalProfile?.focus_areas)];
  return criteria.find((criterion) => recommendations.includes(competencyName(criterion))) ?? criteria[0] ?? null;
}

function Launcher({ trainingTypes, criteria, learningProfiles, consentVersion, initialMode }: {
  trainingTypes: TrainingType[];
  criteria: Criterion[];
  learningProfiles: LearningProfile[];
  consentVersion: string;
  initialMode: TrainingMode;
}) {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const initialTypeId = trainingTypes[0]?.id ?? "";
  const initialCriteria = criteria.filter((criterion) => criterion.training_type_id === initialTypeId);
  const initialRecommendation = recommendedCriterion(initialCriteria, learningProfiles, initialTypeId);
  const [trainingTypeId, setTrainingTypeId] = useState(initialTypeId);
  const [mode, setMode] = useState<TrainingMode>(initialMode);
  const [focusCriterionId, setFocusCriterionId] = useState(initialRecommendation?.id ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [consent, setConsent] = useState(false);
  const filteredCriteria = criteria.filter((criterion) => criterion.training_type_id === trainingTypeId);
  const recommendation = recommendedCriterion(filteredCriteria, learningProfiles, trainingTypeId);
  const typeProfile = learningProfiles.find((profile) => profile.training_type_id === trainingTypeId)
    ?? learningProfiles.find((profile) => profile.training_type_id === null);

  function changeTrainingType(nextTypeId: string) {
    const nextCriteria = criteria.filter((criterion) => criterion.training_type_id === nextTypeId);
    setTrainingTypeId(nextTypeId);
    setFocusCriterionId(recommendedCriterion(nextCriteria, learningProfiles, nextTypeId)?.id ?? "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setMessage(null); setPreparing(true);
    try {
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission.getTracks().forEach((track) => track.stop());
      const response = await fetch("/api/sessions/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trainingTypeId,
          mode,
          focusCriterionId: mode === "focus" ? focusCriterionId : undefined,
          consent,
          consentVersion,
        }),
      });
      const result = await response.json() as { sessionId?: string; signedUrl?: string; dynamicVariables?: DynamicVariables; error?: string };
      if (!response.ok || !result.sessionId || !result.signedUrl || !result.dynamicVariables) throw new Error(result.error || "Session konnte nicht gestartet werden.");
      setSessionId(result.sessionId);
      const preparedSessionId = result.sessionId;
      startSession({
        signedUrl: result.signedUrl,
        connectionType: "websocket",
        dynamicVariables: result.dynamicVariables,
        onConnect: async ({ conversationId }) => {
          const bind = await fetch(`/api/sessions/${preparedSessionId}/bind`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId }) });
          if (!bind.ok) { await endSession(); setError("Die Voice-Verbindung konnte nicht sicher zugeordnet werden."); }
          else setMessage("Ossi hört zu. Viel Erfolg!");
        },
        onDisconnect: () => setMessage("Gespräch beendet. Die Auswertung wird verarbeitet."),
        onError: (providerError) => setError(typeof providerError === "string" ? providerError : "Die Voice-Verbindung wurde unterbrochen."),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Session konnte nicht gestartet werden.");
    } finally { setPreparing(false); }
  }

  return (
    <div className="portal-grid training-grid">
      <section className="portal-card training-config"><span className="card-label-app">Vorbereitung</span><h2>Training konfigurieren</h2><form className="form-stack" onSubmit={submit}>
        <fieldset className="training-type-field"><legend>Trainingsart</legend><div className="training-type-grid">
          {trainingTypes.map((type) => {
            const descriptionId = `training-type-${type.id}-description`;
            return <label className={`training-type-option ${trainingTypeId === type.id ? "selected" : ""}`} key={type.id}>
              <input type="radio" name="trainingType" value={type.id} checked={trainingTypeId === type.id} onChange={() => changeTrainingType(type.id)} aria-describedby={descriptionId} />
              <span><strong>{type.name}</strong><small id={descriptionId}>{type.description}</small></span>
            </label>;
          })}
        </div></fieldset>
        <fieldset className="mode-field"><legend>Wie möchtest du einsteigen?</legend><div className="mode-grid">
          <label className={`mode-option ${mode === "surprise" ? "selected" : ""}`}><input type="radio" name="mode" value="surprise" checked={mode === "surprise"} onChange={() => setMode("surprise")} /><span><strong>Ossi überrascht mich <small className="badge">Standard</small></strong><small>Ossi wählt Gesprächslage, Einwände und wechselnden Schwerpunkt.</small></span></label>
          <label className={`mode-option ${mode === "focus" ? "selected" : ""}`}><input type="radio" name="mode" value="focus" checked={mode === "focus"} onChange={() => setMode("focus")} /><span><strong>Gezielt trainieren</strong><small>Du bestimmst den Schwerpunkt, das konkrete Szenario bleibt überraschend.</small></span></label>
        </div></fieldset>
        {mode === "focus" && <div className="field"><label htmlFor="focusCriterion">Trainingsschwerpunkt</label><select id="focusCriterion" value={focusCriterionId} onChange={(event) => setFocusCriterionId(event.target.value)} required>{filteredCriteria.map((criterion) => <option value={criterion.id} key={criterion.id}>{criterion.name}{criterion.id === recommendation?.id ? " (von Ossi empfohlen)" : ""}</option>)}</select>{typeProfile?.next_learning_goal && <small>Ossis aktuelles Lernziel: {typeProfile.next_learning_goal}</small>}</div>}
        <div className={`consent-field ${consent ? "confirmed" : ""}`}>
          <label className="checkbox-field"><input name="consent" type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} aria-describedby="transcript-consent-description transcript-consent-status" /><span><strong>Einwilligung zur Transkriptspeicherung</strong><small id="transcript-consent-description">Ich stimme zu, dass das strukturierte Transkript dieser Session für zwölf Monate gespeichert und verarbeitet wird. Nur so sind Auswertung, Lernfortschritt und historische Personalisierung in zukünftigen Trainings möglich. Ich verwende keine vertraulichen Kunden-, Personen- oder Projektdaten.</small></span></label>
          <p id="transcript-consent-status" className="consent-status" aria-live="polite">{consent ? "Einwilligung erteilt – die Voice-Session kann gestartet werden." : "Ohne Einwilligung kann keine Voice-Session gestartet werden."}</p>
        </div>
        {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message" role="status">{message}</p>}
        {status === "connected" ? <button className="button button-danger" type="button" onClick={() => endSession()}>Gespräch beenden</button> : <button className="button button-primary" type="submit" disabled={!consent || preparing || !filteredCriteria.length || (mode === "focus" && !focusCriterionId)}>{preparing || status === "connecting" ? "Verbindung wird aufgebaut …" : "Voice-Training starten"}</button>}
        {sessionId && status === "disconnected" && <Link href={`/app/sessions/${sessionId}`}>Zur Session-Auswertung →</Link>}
      </form></section>
      <aside className="voice-session portal-card">
        <div className="voice-portrait">
          <OssiPortrait variant="session" decorative />
        </div>
        <div className="voice-session-shade" aria-hidden="true" />
        <p className="eyebrow light"><span /> Voice Session</p>
        <div className={`voice-status ${status === "connecting" ? "connecting" : status === "connected" ? "connected" : "ready"}`} role="status"><i aria-hidden="true" /> {status === "connected" ? "Live" : status === "connecting" ? "Verbindung" : "Bereit"}</div>
        <div className="voice-copy"><h2>Ossi ist {status === "connected" ? "im Gespräch" : status === "connecting" ? "gleich da" : "bereit"}.</h2><p>{mode === "surprise" ? "Ossi gestaltet ein unerwartetes, anspruchsvolles Gespräch und sorgt über mehrere Sessions für Abwechslung." : `Ossi richtet das Gespräch auf ${filteredCriteria.find((criterion) => criterion.id === focusCriterionId)?.name ?? "deinen gewählten Schwerpunkt"} aus. Rolle, Situation und Einwände bleiben überraschend.`}</p></div>
        <div className="sound-bars" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
      </aside>
    </div>
  );
}

export function TrainingLauncher(props: {
  trainingTypes: TrainingType[];
  criteria: Criterion[];
  learningProfiles: LearningProfile[];
  consentVersion: string;
  initialMode: TrainingMode;
}) {
  return <ConversationProvider serverLocation="eu-residency"><Launcher {...props} /></ConversationProvider>;
}
