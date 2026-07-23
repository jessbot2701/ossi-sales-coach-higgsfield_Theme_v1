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

  it("disables provider audio retention", () => {
    expect(config.platform_settings.privacy).toMatchObject({ record_voice: false, zero_retention_mode: true });
    expect(config.platform_settings.workspace_overrides.webhooks.send_audio).toBe(false);
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

  it("uses surprise as the default and a fixed adaptive challenge", () => {
    const agent = config.conversation_config.agent;
    expect(agent.dynamic_variables.dynamic_variable_placeholders.scenario).toBe("Ossi überrascht dich");
    expect(agent.dynamic_variables.dynamic_variable_placeholders).not.toHaveProperty("difficulty");
    expect(agent.prompt.prompt).not.toContain("{{difficulty}}");
    expect(agent.prompt.prompt).toContain("Jedes Rollenspiel ist anspruchsvoll, realistisch und adaptiv");
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
