import { describe, expect, it } from "vitest";
import { extractPostCallAnalysis } from "@/lib/elevenlabs/analysis";
import { sanitizeSessionStrengths } from "@/lib/coaching/evaluation-integrity";
import { analyzeTranscriptPhases } from "@/lib/coaching/transcript-phases";
import { twoRoleplays } from "./fixtures/roleplay";

describe("post-call analysis extraction", () => {
  it.each([
    { value: ["Ruhig, auch bei Einwänden", "", null, 42, "Fragen; präzise", "Nutzen\nklar"], expected: ["Ruhig, auch bei Einwänden", "Fragen; präzise", "Nutzen\nklar"] },
    { value: [], expected: [] },
    { value: [" ", null, false], expected: [] },
    { value: "- Ruhiger Einstieg\n2. Offene Fragen;Klarer Nutzen", expected: ["Ruhiger Einstieg", "Offene Fragen", "Klarer Nutzen"] },
    { value: "Ruhiger Einstieg, offene Fragen, klarer Nutzen", expected: ["Ruhiger Einstieg", "offene Fragen", "klarer Nutzen"] },
    { value: null, expected: [] },
  ])("keeps array boundaries and explicitly parses supported legacy strengths: $value", ({ value, expected }) => {
    for (const collection of [
      { session_conclusion: { value: JSON.stringify({ strengths: value }) } },
      { strengths: { value } },
    ]) {
      const result = extractPostCallAnalysis({ data_collection_results: collection });
      expect(sanitizeSessionStrengths(result.strengths, analyzeTranscriptPhases(twoRoleplays))).toEqual(expected);
      expect(sanitizeSessionStrengths(result.strengths, analyzeTranscriptPhases([]))).toEqual([]);
    }
  });

  it("does not replace an explicit empty strengths array with legacy content", () => {
    expect(extractPostCallAnalysis({ data_collection_results: {
      session_conclusion: { value: { strengths: [] } }, strengths: { value: "Alte Stärke" },
    } }).strengths).toEqual([]);
  });
  it("extracts a standalone goal and supports direct collection values and fenced improvement JSON", () => {
    const result = extractPostCallAnalysis({ data_collection: {
      next_learning_goal: "Zwei offene Fragen vor dem Lösungsvorschlag stellen.",
      conversation_opening_feedback: "Den Anlass präzise und kundenzentriert benennen.",
      conversation_opening_evidence: "Guten Tag, ich rufe wegen Ihrer Lagerprozesse an.",
      conversation_opening_improvement: '```json\n{"improvement":"Den Bedarf konkret erfragen.","alternative":"Was möchten Sie verbessern?","evidence":"Ihre Lagerprozesse","priority":2}\n```',
    } });
    expect(result.nextLearningGoal).toBe("Zwei offene Fragen vor dem Lösungsvorschlag stellen.");
    expect(result.feedback.conversation_opening).toBe("Den Anlass präzise und kundenzentriert benennen.");
    expect(result.improvementPriorities.conversation_opening).toBe(2);
  });

  it.each([undefined, {}, { data_collection_results: {
    conversation_opening_feedback: { value: { text: "invalid" } },
    conversation_opening_evidence: { value: ["invalid"] },
    conversation_opening_improvement: { value: "not JSON" },
    session_conclusion: { value: { next_learning_goal: { text: "invalid" } } },
    next_learning_goal: { value: 42 },
  } }])("does not fabricate missing or invalid provider fields: %j", (analysis) => {
    const result = extractPostCallAnalysis(analysis);
    expect(result.feedback.conversation_opening).toBeNull();
    expect(result.criterionEvidence.conversation_opening).toBeNull();
    expect(result.improvementsByCriterion.conversation_opening).toBeNull();
    expect(result.nextLearningGoal).toBeNull();
  });

  it("prefers a valid session conclusion goal over the standalone goal", () => {
    expect(extractPostCallAnalysis({ data_collection_results: {
      session_conclusion: { value: { next_learning_goal: "Das vereinbarte Lernziel aus dem Abschluss." } },
      next_learning_goal: { value: "Anderes Lernziel." },
    } }).nextLearningGoal).toBe("Das vereinbarte Lernziel aus dem Abschluss.");
  });

  it("extracts all configured integer scores and coaching text", () => {
    const result = extractPostCallAnalysis({
      transcript_summary: "Fallback",
      data_collection_results: {
        conversation_opening: { value: 4, rationale: "klar" },
        needs_discovery: { value: 3 },
        value_proposition: { value: 5 },
        objection_handling: { value: 2 },
        closing: { value: 3 },
        language_impact: { value: 4 },
        conversation_opening_feedback: { value: "Direkter und relevanter einsteigen." },
        conversation_opening_evidence: { value: "Ich würde gerne unser Portfolio vorstellen." },
        conversation_opening_improvement: {
          value: JSON.stringify({
            improvement: "Den Anlass kundenzentriert formulieren.",
            alternative: "Wie priorisieren Sie aktuell Ihre Lagerprozesse?",
            evidence: "Ich würde gerne unser Portfolio vorstellen.",
            priority: 1,
          }),
        },
        session_conclusion: {
          value: JSON.stringify({
            summary: "Kompakte Zusammenfassung",
            strengths: ["Ruhige Sprache", "Klare Frage"],
            next_learning_goal: "Einwände spiegeln",
          }),
        },
      },
    });
    expect(Object.values(result.scores)).toEqual([4, 3, 5, 2, 3, 4]);
    expect(result.summary).toBe("Kompakte Zusammenfassung");
    expect(result.feedback.conversation_opening).toBe("Direkter und relevanter einsteigen.");
    expect(result.criterionEvidence.conversation_opening).toBe("Ich würde gerne unser Portfolio vorstellen.");
    expect(result.improvementsByCriterion.conversation_opening).toBe("Den Anlass kundenzentriert formulieren.");
    expect(result.alternativesByCriterion.conversation_opening).toBe("Wie priorisieren Sie aktuell Ihre Lagerprozesse?");
    expect(result.improvementEvidenceByCriterion.conversation_opening).toBe("Ich würde gerne unser Portfolio vorstellen.");
    expect(result.improvementPriorities.conversation_opening).toBe(1);
    expect(result.feedback.needs_discovery).toBeNull();
    expect(result.strengths).toEqual(["Ruhige Sprache", "Klare Frage"]);
    expect(result.nextLearningGoal).toBe("Einwände spiegeln");
  });

  it("uses null for invalid or unavailable scores instead of score one", () => {
    const result = extractPostCallAnalysis({ data_collection_results: {
      conversation_opening: { value: 0 }, needs_discovery: { value: 6 }, value_proposition: { value: "nicht bewertbar" },
    } });
    expect(result.scores.conversation_opening).toBeNull();
    expect(result.scores.needs_discovery).toBeNull();
    expect(result.scores.value_proposition).toBeNull();
    expect(result.improvementPriorities.conversation_opening).toBeNull();
  });

  it("does not invent missing fields from malformed improvement JSON", () => {
    const result = extractPostCallAnalysis({
      data_collection_results: {
        conversation_opening_improvement: {
          value: "{\"improvement\":\"Klarer einsteigen\"}",
        },
      },
    });

    expect(result.improvementsByCriterion.conversation_opening).toBe("Klarer einsteigen");
    expect(result.alternativesByCriterion.conversation_opening).toBeNull();
    expect(result.improvementEvidenceByCriterion.conversation_opening).toBeNull();
    expect(result.improvementPriorities.conversation_opening).toBeNull();
  });
});
