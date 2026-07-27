import { describe, expect, it } from "vitest";
import { extractPostCallAnalysis } from "@/lib/elevenlabs/analysis";

describe("post-call analysis extraction", () => {
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
        summary: { value: "Kompakte Zusammenfassung" },
        next_learning_goal: { value: "Einwände spiegeln" },
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
