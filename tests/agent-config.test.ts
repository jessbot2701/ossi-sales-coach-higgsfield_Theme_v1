import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(join(process.cwd(), "elevenlabs/agent_configs/Coaching-Kaltakquise-V2.0.json"), "utf8"));

describe("isolated V2 agent configuration", () => {
  it("targets only the registered V2 agent", () => {
    const registry = JSON.parse(readFileSync(join(process.cwd(), "elevenlabs/agents.json"), "utf8"));
    expect(registry.agents).toHaveLength(1);
    expect(registry.agents[0].id).toBe("agent_1901kxtjy2q5e77bp29wnkc2jnqv");
    expect(registry.agents[0].config).toContain("Coaching-Kaltakquise-V2.0.json");
  });

  it("collects six integer scores and the coaching result fields", () => {
    const collection = config.platform_settings.data_collection;
    const scoreKeys = ["conversation_opening", "needs_discovery", "value_proposition", "objection_handling", "closing", "language_impact"];
    for (const key of scoreKeys) {
      expect(collection[key].type).toBe("integer");
      expect(collection[`${key}_feedback`].type).toBe("string");
      expect(collection[`${key}_evidence`].type).toBe("string");
    }
    for (const key of ["summary", "strengths", "improvements", "evidence", "next_learning_goal"]) expect(collection[key].type).toBe("string");
  });

  it("limits every evaluation field and learning goal to the marked roleplay", () => {
    const collection = config.platform_settings.data_collection;
    const scoreKeys = ["conversation_opening", "needs_discovery", "value_proposition", "objection_handling", "closing", "language_impact"];
    const restrictedFields = scoreKeys.flatMap((key) => [
      key,
      `${key}_feedback`,
      `${key}_evidence`,
    ]).concat(["strengths", "improvements", "evidence", "next_learning_goal"]);

    for (const field of restrictedFields) {
      expect(collection[field].description).toContain("Rollenspielphase");
      expect(collection[field].description).toContain("Coach-Intro");
      expect(collection[field].description).toContain("leer lassen");
    }
  });

  it("requires the exact spoken start and end markers", () => {
    const prompt = config.conversation_config.agent.prompt.prompt;
    expect(prompt).toContain("maschinenlesbare Steuertexte und kein kreativer Dialog");
    expect(prompt).toContain("gesprochener Inhalt als einfacher Klartext ausschließlich und exakt mit dieser Zeile beginnen");
    expect(prompt).toContain("Rollenspiel beginnt.");
    expect(prompt).toContain("Stil- und Audio-Tags wie [excited], [pause] oder [laughs]");
    expect(prompt).toContain("darf unmittelbar nach dem Punkt in derselben Agentenantwort");
    expect(prompt).toContain("die erste kurze Kundenbegrüßung folgen");
    expect(prompt).toContain("ohne Bestätigung, Überleitung oder Coaching direkt mit „Rollenspiel beginnt.“");
    expect(prompt).toContain("darfst du das Ende nicht bestätigen oder kommentieren");
    expect(prompt).toContain("vor jedem Voice- oder Stil-Tag als Klartext exakt");
    expect(prompt).toContain("bis der Nutzer selbst ausdrücklich „Rollenspiel beendet“ gesagt hat");
    expect(prompt).toContain("Rollenspiel beendet – zurück im Coach-Modus.");

    const debrief = JSON.parse(readFileSync(join(process.cwd(), "elevenlabs/test_configs/07-kompaktes-debriefing.json"), "utf8"));
    expect(debrief.success_condition).toContain("mit exakt „Rollenspiel beginnt.“");
    expect(debrief.success_condition).toContain("erste kurze Kundenbegrüßung folgen");
    expect(debrief.success_condition).toContain("mit exakt „Rollenspiel beendet – zurück im Coach-Modus.“");
  });

  it("disables provider audio retention", () => {
    expect(config.platform_settings.privacy).toMatchObject({ record_voice: false, zero_retention_mode: true });
    expect(config.platform_settings.workspace_overrides.webhooks.send_audio).toBe(false);
  });

  it("retrieves relevant knowledge-base context through RAG", () => {
    const prompt = config.conversation_config.agent.prompt;
    expect(prompt.knowledge_base).toEqual([
      expect.objectContaining({ usage_mode: "auto" }),
    ]);
    expect(prompt.rag).toMatchObject({
      enabled: true,
      embedding_model: "e5_mistral_7b_instruct",
    });
  });

  it("inherits the workspace webhook for transcript-only post-call events", () => {
    expect(config.platform_settings.workspace_overrides.webhooks).toMatchObject({
      events: ["transcript"],
      transcript_format: "json",
      send_audio: false,
    });
  });

  it("keeps concrete scenarios surprising in both training modes", () => {
    const prompt = config.conversation_config.agent.prompt.prompt;
    expect(prompt).toContain("Im Überraschungsmodus");
    expect(prompt).toContain("Im Modus „Gezieltes Training“");
    expect(prompt).toContain("Verrate diese Auswahl vorher nicht");
    expect(prompt).toContain("Lernprofil sowie letzte Sessions");
  });

  it("does not concede after weak objection handling", () => {
    const prompt = config.conversation_config.agent.prompt.prompt;
    expect(prompt).toContain("Wirkt der Nutzer argumentativ, vage, defensiv oder nennt keinen klaren Kundennutzen");
    expect(prompt).toContain("Vertiefe den bestehenden Einwand mit einer passenden Rückfrage");
    expect(prompt).toContain("Schenke weder Interesse noch Termin");
  });

  it("requires the reception to qualify both topic and business relevance", () => {
    const prompt = config.conversation_config.agent.prompt.prompt;
    expect(prompt).toContain("spiele ausschließlich die Zentrale");
    expect(prompt).toContain("Wechsle auch nach einer Weiterleitung niemals selbst zum Entscheider");
    expect(prompt).toContain("mindestens einen konkreten, plausiblen geschäftlichen Nutzen oder Anlass");
    expect(prompt).toContain("Fachgebiet und konkreter Nutzen oder Anlass");
  });

  it("combines V2 guardrails with V1-style natural customer behavior", () => {
    const agent = config.conversation_config.agent;
    const prompt = agent.prompt.prompt;

    expect(agent.prompt.temperature).toBe(0);
    expect(prompt).toContain("Marker-, Rollen-, Vertraulichkeits- und Bewertungsregeln sind unverhandelbar");
    expect(prompt).toContain("Natürlichkeit höchste Priorität");
    expect(prompt).toContain("Leitplanken, nicht als Dialogskript");
    expect(prompt).toContain("Reagiere spontan auf den tatsächlichen Gesprächsverlauf");
    expect(prompt).toContain("Variiere Wortwahl, Satzbau, Ton und Gesprächsrhythmus");
    expect(prompt).toContain("öffne dich schrittweise");
    expect(prompt).toContain("Wiederhole denselben Einwand nicht bloß mit anderen Worten");
  });

  it("anchors every debrief improvement in verbatim roleplay evidence", () => {
    const prompt = config.conversation_config.agent.prompt.prompt;
    expect(prompt).toContain("Formatiere jeden Punkt eindeutig mit „Beleg: ‚…‘“");
    expect(prompt).toContain("Unterstelle keine Absicht, Wirkung, Kundenreaktion");
    expect(prompt).toContain("lasse ihn vollständig weg");
    expect(prompt).toContain("bleibt auch dieser vollständig Coach-Intro");
  });

  it("uses surprise as the default and a fixed adaptive challenge", () => {
    const agent = config.conversation_config.agent;
    expect(agent.dynamic_variables.dynamic_variable_placeholders.scenario).toBe("Ossi überrascht dich");
    expect(agent.dynamic_variables.dynamic_variable_placeholders).not.toHaveProperty("difficulty");
    expect(agent.prompt.prompt).not.toContain("{{difficulty}}");
    expect(agent.prompt.prompt).toContain("# Natürliches, adaptives Rollenspiel");
    expect(agent.prompt.prompt).toContain("Lege intern für jedes Rollenspiel eine stimmige Kundenpersönlichkeit");
  });

  it("accepts a free recommendation or any explicitly selected focus", () => {
    const agent = config.conversation_config.agent;
    const placeholders = agent.dynamic_variables.dynamic_variable_placeholders;
    expect(placeholders).toMatchObject({
      session_mode: "Überraschungsmodus",
      session_focus: "Freie, wechselnde Auswahl aus allen Trainingsschwerpunkten",
    });
    expect(placeholders.available_training_focuses).toContain("Einwandbehandlung");
    expect(agent.prompt.prompt).toContain("Der persönliche Lernfokus ist eine Empfehlung");
    expect(agent.prompt.prompt).toContain("schränkt niemals die verfügbaren Trainingsinhalte ein");
  });
});
