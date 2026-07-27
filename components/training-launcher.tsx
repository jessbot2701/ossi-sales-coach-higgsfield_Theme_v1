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
  const voiceState = status === "connecting" ? "connecting" : status === "connected" ? "connected" : "ready";
  const selectedFocus = filteredCriteria.find((criterion) => criterion.id === focusCriterionId)?.name
    ?? "deinen gewählten Schwerpunkt";

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
      <section className="portal-card training-config"><span className="card-label-app">Vorbereitung</span><h2>Training konfigurieren</h2><form id="training-config-form" className="form-stack" onSubmit={submit}>
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
      </form></section>
      <aside className="voice-session portal-card" aria-label="Voice-Phone">
        <div className={`voice-phone ${voiceState}`}>
          <span className="voice-phone-side voice-phone-side-volume" aria-hidden="true" />
          <span className="voice-phone-side voice-phone-side-power" aria-hidden="true" />
          <div className="voice-phone-screen">
            <div className="voice-phone-statusbar" aria-hidden="true">
              <span>09:41</span>
              <span className="voice-phone-signal"><i /><i /><i /></span>
            </div>
            <span className="voice-phone-island" aria-hidden="true" />
            <div className="voice-portrait">
              <OssiPortrait variant="session" decorative />
            </div>
            <div className="voice-session-shade" aria-hidden="true" />
            <div className="voice-phone-header">
              <p className="eyebrow light"><span /> Voice Session</p>
              <div className={`voice-status ${voiceState}`} role="status"><i aria-hidden="true" /> {status === "connected" ? "Live" : status === "connecting" ? "Verbindung" : "Bereit"}</div>
            </div>
            <div className="voice-copy">
              <h2>Ossi ist {status === "connected" ? "im Gespräch" : status === "connecting" ? "gleich da" : "bereit"}.</h2>
              <p>{mode === "surprise" ? "Ossi gestaltet ein unerwartetes, anspruchsvolles Gespräch und sorgt über mehrere Sessions für Abwechslung." : `Ossi richtet das Gespräch auf ${selectedFocus} aus. Rolle, Situation und Einwände bleiben überraschend.`}</p>
            </div>
            <div className="sound-bars" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
            <div className="voice-phone-controls">
              {status === "connected" ? (
                <button className="voice-call-button hangup" type="button" onClick={() => endSession()} aria-label="Gespräch beenden">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c3.5-1.7 7.3-1.7 10.8 0l1.6.8c.7.4 1 1.2.7 2l-.8 2.1c-.3.7-1 1.1-1.8.9l-2.5-.7a1.5 1.5 0 0 1-1.1-1.4v-.8a11.8 11.8 0 0 0-3 0v.8c0 .7-.5 1.3-1.1 1.4l-2.5.7c-.7.2-1.5-.2-1.8-.9l-.8-2.1c-.3-.8 0-1.6.7-2l1.6-.8Z" /></svg>
                </button>
              ) : (
                <button
                  className="voice-call-button start"
                  type="submit"
                  form="training-config-form"
                  disabled={!consent || preparing || !filteredCriteria.length || (mode === "focus" && !focusCriterionId)}
                  aria-label="Voice-Training starten"
                  aria-busy={preparing || status === "connecting"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.1 3.3 9.6 3c.7-.1 1.4.4 1.6 1.1l.8 3.1c.2.7-.1 1.4-.7 1.8l-1.7 1a14.8 14.8 0 0 0 4.4 4.4l1-1.7c.4-.6 1.1-.9 1.8-.7l3.1.8c.7.2 1.2.9 1.1 1.6l-.3 2.5c-.1.9-.8 1.6-1.7 1.7C11.6 19.4 4.6 12.4 5.4 5c.1-.9.8-1.6 1.7-1.7Z" /></svg>
                </button>
              )}
              <strong>{status === "connected" ? "Gespräch beenden" : preparing || status === "connecting" ? "Ossi wird angerufen …" : "Ossi anrufen"}</strong>
              <small>{status === "connected" ? "Die Auswertung startet danach automatisch." : consent ? "Mikrofon und Voice-Session starten" : "Zuerst links der Speicherung zustimmen"}</small>
            </div>
            {sessionId && status === "disconnected" && <Link className="voice-session-link" href={`/app/sessions/${sessionId}`}>Zur Session-Auswertung →</Link>}
            <span className="voice-phone-home" aria-hidden="true" />
          </div>
        </div>
        <p className="voice-phone-note">Konfiguration wählen, Einwilligung geben und Ossi direkt im Phone anrufen.</p>
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
