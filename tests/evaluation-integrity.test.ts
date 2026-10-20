import { describe, expect, it } from "vitest";
import {
  sanitizeSessionStrengths,
  validateCriterionEvaluations,
} from "@/lib/coaching/evaluation-integrity";
import { ROLEPLAY_START_MARKER } from "@/lib/coaching/transcript-phases";
import { coachingReply, coachSuggestion, firstEvidence, secondEvidence, twoRoleplays } from "./fixtures/roleplay";

const evaluation = (overrides: Partial<{
  score: number | null;
  reasoning: string | null;
  evidence: string | null;
  recommendation: string | null;
  alternative_formulation: string | null;
  improvement_evidence: string | null;
  improvement_priority: number | null;
}> = {}) => ({
  score: 4,
  reasoning: "Du hast den Anlass klar benannt und bist ruhig in das Gespräch eingestiegen.",
  evidence: "Guten Tag, mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse an.",
  ...overrides,
});

const transcript = [
  { role: "agent", message: "Hallo, ich bin Ossi. Heute trainieren wir Kaltakquise. Bist du bereit?" },
  { role: "user", message: "Ich bin bereit." },
  { role: "agent", message: "Rollenspiel beginnt." },
  { role: "user", message: "Guten Tag, mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse an." },
  { role: "agent", message: "Danke. Rollenspiel beendet – zurück im Coach-Modus." },
  { role: "user", message: "Das hört sich besser an. Ciao, Ossi." },
];

describe("criterion evaluation integrity", () => {
  it.each([firstEvidence, secondEvidence])("accepts provider evidence from either exercise: %s", (evidence) => {
    const result = validateCriterionEvaluations([evaluation({ evidence })], twoRoleplays)[0];
    expect(result).toMatchObject({ score: 4, evidence });
  });

  it.each([coachingReply, coachSuggestion])("excludes coaching and agent suggestions between exercises: %s", (evidence) => {
    expect(validateCriterionEvaluations([evaluation({ evidence })], twoRoleplays)[0])
      .toMatchObject({ score: null, reasoning: null, evidence: null });
  });

  it("only accepts evidence from completed exercises in a partial transcript", () => {
    const partial = [
      ...twoRoleplays.slice(0, 4),
      { role: "agent", message: ROLEPLAY_START_MARKER },
      { role: "user", message: secondEvidence },
    ];
    const results = validateCriterionEvaluations([
      evaluation({ evidence: firstEvidence }),
      evaluation({ evidence: secondEvidence, reasoning: "Die Frage ist klar auf die konkreten Engpässe ausgerichtet." }),
    ], partial);
    expect(results.map((item) => item.score)).toEqual([4, null]);
  });

  it("keeps complete improvements from either exercise without accepting coaching evidence", () => {
    for (const evidence of [firstEvidence, secondEvidence, coachingReply, coachSuggestion]) {
      const result = validateCriterionEvaluations([evaluation({
        score: 3,
        evidence: firstEvidence,
        recommendation: "Mit offenen Fragen den konkreten Bedarf herausarbeiten.",
        alternative_formulation: "Welche Abläufe möchten Sie als Erstes verbessern?",
        improvement_evidence: evidence,
        improvement_priority: 1,
      })], twoRoleplays)[0];
      expect(result.score).toBe([firstEvidence, secondEvidence].includes(evidence) ? 3 : null);
    }
  });

  it("keeps a specific evaluation whose evidence occurs in a user turn", () => {
    expect(validateCriterionEvaluations([evaluation()], transcript)[0].score).toBe(4);
  });

  it("rejects evidence taken from an agent turn", () => {
    const result = validateCriterionEvaluations([
      evaluation({ evidence: "Hallo, ich bin Ossi. Heute trainieren wir Kaltakquise." }),
    ], transcript)[0];

    expect(result).toMatchObject({ score: null, reasoning: null, evidence: null });
  });

  it.each([
    "Ich bin bereit.",
    "Das hört sich besser an.",
    "Ciao, Ossi.",
  ])("rejects coach-dialog evidence outside the roleplay: %s", (evidence) => {
    const result = validateCriterionEvaluations([
      evaluation({ evidence }),
    ], transcript)[0];

    expect(result).toMatchObject({ score: null, reasoning: null, evidence: null });
  });

  it("rejects reasoning copied from an agent turn", () => {
    const result = validateCriterionEvaluations([
      evaluation({ reasoning: "Hallo, ich bin Ossi. Heute trainieren wir Kaltakquise. Bist du bereit?" }),
    ], transcript)[0];

    expect(result.score).toBeNull();
  });

  it("rejects a general explanation repeated across criteria", () => {
    const repeated = "Du solltest die Gesprächsführung insgesamt klarer und verbindlicher gestalten.";
    const result = validateCriterionEvaluations([
      evaluation({ reasoning: repeated }),
      evaluation({ reasoning: repeated }),
    ], transcript);

    expect(result.map((item) => item.score)).toEqual([null, null]);
  });

  it("matches evidence despite punctuation and a trailing ellipsis", () => {
    const result = validateCriterionEvaluations([
      evaluation({ evidence: "Guten Tag – mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse..." }),
    ], transcript)[0];

    expect(result.score).toBe(4);
  });

  it.each([
    "GUTEN TAG – mein Name ist Weiß",
    "Ich rufe wegen Ihrer Lagerprozesse an.",
    "Ｇｕｔｅｎ Tag, mein Name ist Weiß.",
  ])("keeps a fully evidenced quote under Unicode, case and punctuation normalization: %s", (evidence) => {
    expect(validateCriterionEvaluations([evaluation({ evidence })], transcript)[0])
      .toMatchObject({ score: 4, evidence });
  });

  it("does not match a quote ending inside another word", () => {
    expect(validateCriterionEvaluations([evaluation({ evidence: "Ich rufe wegen Ihrer Lager" })], transcript)[0])
      .toMatchObject({ score: null, evidence: null });
  });

  it("marks every criterion unrated when no safe roleplay boundaries exist", () => {
    const result = validateCriterionEvaluations([evaluation()], [
      { role: "user", message: evaluation().evidence as string },
    ])[0];

    expect(result).toMatchObject({ score: null, reasoning: null, evidence: null });
  });

  it("removes the learning recommendation with an invalid criterion", () => {
    const result = validateCriterionEvaluations([{
      ...evaluation({ evidence: "Ich bin bereit." }),
      recommendation: "Gesprächseröffnung weiter trainieren.",
    }], transcript)[0];

    expect(result.recommendation).toBeNull();
  });

  it("keeps a complete category improvement with roleplay evidence", () => {
    const result = validateCriterionEvaluations([evaluation({
      score: 3,
      recommendation: "Den Einstieg stärker auf den Kundennutzen ausrichten.",
      alternative_formulation: "Wie priorisieren Sie aktuell Ihre Lagerprozesse?",
      improvement_evidence: "Guten Tag, mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse an.",
      improvement_priority: 1,
    })], transcript)[0];

    expect(result).toMatchObject({
      recommendation: "Den Einstieg stärker auf den Kundennutzen ausrichten.",
      alternative_formulation: "Wie priorisieren Sie aktuell Ihre Lagerprozesse?",
      improvement_priority: 1,
    });
  });

  it("removes an incomplete category improvement", () => {
    const result = validateCriterionEvaluations([evaluation({
      score: 3,
      recommendation: "Den Einstieg stärker auf den Kundennutzen ausrichten.",
      alternative_formulation: null,
      improvement_evidence: "Guten Tag, mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse an.",
      improvement_priority: 1,
    })], transcript)[0];

    expect(result).toMatchObject({
      score: null,
      recommendation: null,
      alternative_formulation: null,
      improvement_evidence: null,
      improvement_priority: null,
    });
  });

  it("removes a category improvement whose evidence is outside the roleplay", () => {
    const result = validateCriterionEvaluations([evaluation({
      score: 3,
      recommendation: "Den Einstieg stärker auf den Kundennutzen ausrichten.",
      alternative_formulation: "Wie priorisieren Sie aktuell Ihre Lagerprozesse?",
      improvement_evidence: "Ich bin bereit.",
      improvement_priority: 1,
    })], transcript)[0];

    expect(result.recommendation).toBeNull();
  });

  it("stores up to six complete category improvements but ranks only three", () => {
    const result = validateCriterionEvaluations([1, 2, 3, 3].map((priority, index) => evaluation({
      score: 3,
      reasoning: `Kriterienspezifische Begründung Nummer ${index + 1} für diese Bewertung.`,
      recommendation: `Verbesserung ${index + 1}`,
      alternative_formulation: `Alternative ${index + 1}`,
      improvement_evidence: "Guten Tag, mein Name ist Weiß. Ich rufe wegen Ihrer Lagerprozesse an.",
      improvement_priority: priority,
    })), transcript);

    expect(result.filter((item) => item.recommendation)).toHaveLength(4);
    expect(result.map((item) => item.improvement_priority)).toEqual([1, 2, 3, null]);
  });

  it("keeps at most three session strengths only for a recognized roleplay", () => {
    const phases = {
      status: "recognized" as const,
      reason: null,
      roleplayUserMessages: [],
      segments: [],
    };
    expect(sanitizeSessionStrengths("Ruhiger Einstieg, offene Frage, klarer Nutzen, vierte Stärke", phases))
      .toEqual(["Ruhiger Einstieg", "offene Frage", "klarer Nutzen"]);
  });
});
